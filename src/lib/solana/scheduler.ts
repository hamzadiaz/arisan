/**
 * Arisan Auto-Draw Scheduler
 *
 * Backend utilities for automatically executing draws when deadlines pass.
 * Used by the Vercel cron job to trigger draws without user intervention.
 */

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, OnChainPool, OnChainMember, getPoolStatusString, getDrawPDA, getVaultPDA, getMemberPDA, getPaymentPDA } from "./program";
import { SLOT_HASHES_SYSVAR, isDrawEligible, readSlotHash, selectDerivedWinner } from "./bound-draw";
import { settleRound } from "./round-settlement";
import bs58 from "bs58";

// Wallet interface compatible with AnchorProvider
interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * Create a wallet adapter from a Keypair for use with AnchorProvider
 */
function createWalletFromKeypair(keypair: Keypair): AnchorWallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof Transaction) {
        tx.partialSign(keypair);
      } else {
        // VersionedTransaction
        tx.sign([keypair]);
      }
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return txs.map(tx => {
        if (tx instanceof Transaction) {
          tx.partialSign(keypair);
        } else {
          tx.sign([keypair]);
        }
        return tx;
      });
    },
  };
}

// ============ Types ============

export interface SchedulerPool {
  address: PublicKey;
  name: string;
  currentRound: number;
  nextDrawTimestamp: number;
  memberCount: number;
  contributionAmount: number;
  autoMode: boolean;
  /** A draw was started for this round and not finished: it locks the circle in 512 slots */
  committed: boolean;
}

export interface EligibleMember {
  wallet: PublicKey;
  memberPDA: PublicKey;
  position: number;
}

export interface DrawResult {
  poolAddress: string;
  round: number;
  winner: string;
  amount: number;
  signature: string;
  success: boolean;
  /** Not drawn this time, by rule (a seat in grace still owes the round, or nobody can win) */
  skipped?: boolean;
  error?: string;
}

/** mark_defaulter instructions per transaction */
const MARK_BATCH = 8;
/** SlotHashes keeps 512 slots: a commit older than that can never be finished */
const SLOT_HASH_WINDOW = 512;
/** A commit costs a fee; its finish pays the Draw account's rent, maybe a vault top-up and fees */
const MIN_BALANCE_TO_COMMIT = 0.005 * 1e9;
const MIN_BALANCE_TO_FINISH = 0.003 * 1e9;
/** Lamports a data-less account needs to stay open; a vault left with less fails the payout. */
const RENT_EXEMPT_EMPTY = 890_880;
/** execute_draw loads and checks every roster member; 20 seats can pass the 200k default. */
const DRAW_COMPUTE_UNITS = 400_000;

// ============ Connection Setup ============

/**
 * Create a connection to Solana
 */
export function getConnection(): Connection {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpcUrl, "confirmed");
}

/**
 * Load the scheduler keypair from environment variable
 * The private key should be base58 encoded
 */
export function getSchedulerKeypair(): Keypair {
  const privateKey = process.env.SCHEDULER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SCHEDULER_PRIVATE_KEY environment variable not set");
  }

  try {
    // Try base58 decoding first
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch {
    // Try JSON array format [1,2,3,...]
    try {
      const parsed = JSON.parse(privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    } catch {
      throw new Error("Invalid SCHEDULER_PRIVATE_KEY format. Use base58 or JSON array.");
    }
  }
}

/**
 * Get the Anchor program instance with the scheduler wallet
 */
export function getSchedulerProgram(connection: Connection, keypair: Keypair): Program {
  const wallet = createWalletFromKeypair(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return getProgram(provider);
}

// ============ Pool Fetching ============

// Pool discriminator from IDL
const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

// Expected minimum size for pools with auto_mode field
// 8 (discriminator) + 32 (authority) + 32 (name) + 1 + 1 + 8 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 1 + 1 + 32 + 8 + 8 + 1 + 8 + 1 = 163 bytes
const MIN_POOL_SIZE = 163;

/**
 * Fetch all active pools that have autoMode enabled and are past their draw deadline
 */
export async function getPoolsReadyForDraw(program: Program): Promise<SchedulerPool[]> {
  const now = Math.floor(Date.now() / 1000);
  const poolName = program.idl.accounts?.find((a) => a.name.toLowerCase() === "pool")?.name ?? "pool";
  const readyPools: SchedulerPool[] = [];
  const connection = program.provider.connection;

  try {
    // Fetch all accounts owned by the program with the pool discriminator
    const programId = program.programId;
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(POOL_DISCRIMINATOR),
          },
        },
      ],
    });

    console.log(`Found ${accounts.length} pool accounts on-chain`);

    for (const { pubkey, account } of accounts) {
      try {
        // Skip pools that are too small (old versions without auto_mode)
        if (account.data.length < MIN_POOL_SIZE) {
          console.log(`Skipping pool ${pubkey.toBase58().slice(0, 8)}... - too small (${account.data.length} bytes, need ${MIN_POOL_SIZE})`);
          continue;
        }

        // The account name as the program's (camel-cased) IDL spells it
        const pool = program.coder.accounts.decode(poolName, account.data) as unknown as OnChainPool;
        const status = getPoolStatusString(pool.status);

        console.log(`Pool ${pubkey.toBase58().slice(0, 8)}... - status: ${status}, autoMode: ${pool.autoMode}, nextDraw: ${pool.nextDrawTimestamp.toNumber()}, now: ${now}`);

        // Active and past its deadline, and either automatic (the cron runs its draws) or any
        // circle whose draw was started and not finished: nobody else may tap Finish in time.
        const committed = pool.randomnessRound === pool.currentRound && pool.currentRound > 0;
        if (
          status === "active" &&
          (pool.autoMode || committed) &&
          pool.nextDrawTimestamp.toNumber() < now
        ) {
          // Decode pool name
          const nameBytes = pool.name.filter((b: number) => b !== 0);
          const name = new TextDecoder().decode(Uint8Array.from(nameBytes));

          console.log(`Pool "${name}" is ready for draw!`);

          readyPools.push({
            address: pubkey,
            name,
            currentRound: pool.currentRound,
            nextDrawTimestamp: pool.nextDrawTimestamp.toNumber(),
            memberCount: pool.memberCount,
            contributionAmount: pool.contributionAmount.toNumber(),
            autoMode: pool.autoMode,
            committed,
          });
        }
      } catch (poolErr: any) {
        // Skip pools that fail to deserialize
        console.log(`Skipping pool ${pubkey.toBase58()}: ${poolErr.message}`);
      }
    }
  } catch (err: any) {
    console.error(`Error fetching pools: ${err.message}`);
  }

  console.log(`Found ${readyPools.length} pools ready for draw`);
  // Started draws first: they lock in 512 slots
  return readyPools.sort((a, b) => Number(b.committed) - Number(a.committed));
}

// ============ Member Fetching ============

/**
 * Get eligible members for a pool (can win this round)
 * Eligible = hasn't won yet, not in default, not kicked, not in grace period
 */
export async function getEligibleMembers(
  program: Program,
  poolAddress: PublicKey
): Promise<EligibleMember[]> {
  // Fetch all member accounts for this pool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = program.account as any;
  const memberAccounts = await accounts.member.all([
    {
      memcmp: {
        offset: 8, // discriminator
        bytes: poolAddress.toBase58(),
      },
    },
  ]);

  const eligible: EligibleMember[] = [];

  for (const { publicKey, account } of memberAccounts) {
    const member = account as unknown as OnChainMember;

    // Check eligibility:
    // 1. Hasn't won yet
    // 2. Not in default
    // 3. Not kicked
    // 4. Not in grace period
    if (
      !member.hasWon &&
      !member.inDefault &&
      !member.isKicked &&
      !member.inGracePeriod
    ) {
      eligible.push({
        wallet: member.wallet,
        memberPDA: publicKey,
        position: member.position,
      });
    }
  }

  console.log(`Found ${eligible.length} eligible members for pool ${poolAddress.toBase58()}`);
  return eligible;
}

// ============ Winner Selection ============

/**
 * Select a random winner from eligible members
 * Uses crypto.getRandomValues for secure randomness
 */


// ============ Draw Execution ============

/**
 * Execute a draw for a specific pool
 */
async function sendSchedulerTx(
  connection: Connection,
  keypair: Keypair,
  tx: Transaction
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  return sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
}

/**
 * Commit the draw slot, then pay the member derived from that slot's hash.
 * The scheduler does not choose the winner.
 */
export async function executeDraw(
  connection: Connection,
  program: Program,
  keypair: Keypair,
  pool: SchedulerPool
): Promise<DrawResult> {
  const poolAddress = pool.address;
  const accounts = program.account as any;

  try {
    let poolAccount = await accounts.pool.fetch(poolAddress);
    const round = poolAccount.currentRound as number;
    const skip = (reason: string): DrawResult => ({
      poolAddress: poolAddress.toBase58(),
      round,
      winner: "",
      amount: 0,
      signature: "",
      success: false,
      skipped: true,
      error: reason,
    });

    const roster: PublicKey[] = (poolAccount.memberWallets as PublicKey[])
      .slice(0, poolAccount.rosterLen as number)
      .filter((wallet) => !wallet.equals(PublicKey.default));
    const memberAccounts = roster.map((wallet) => getMemberPDA(poolAddress, wallet)[0]);
    const memberName = program.idl.accounts?.find((a) => a.name.toLowerCase() === "member")?.name ?? "member";
    const readMembers = async () => {
      const infos = await connection.getMultipleAccountsInfo(memberAccounts, "confirmed");
      return infos.map((info) => (info ? (program.coder.accounts.decode(memberName, info.data) as OnChainMember) : null));
    };

    // Settle the round before committing: seats that missed it are marked, so their slashed
    // stake covers the pot and they can't win it; a seat still in grace from an earlier round
    // holds the draw. The app follows the same rule (round-settlement.ts). A commit already
    // made for this round skips straight to the execute: it expires in 512 slots.
    // Manual circles are drawn by their members; the cron only finishes a draw someone started
    if (!poolAccount.autoMode && poolAccount.randomnessRound !== round) {
      return skip("Manual circle: nothing started to finish");
    }

    const balance = await connection.getBalance(keypair.publicKey, "confirmed");
    if (poolAccount.randomnessRound !== round) {
      // Never start a draw it can't afford to finish
      if (balance < MIN_BALANCE_TO_COMMIT) return skip("Scheduler balance too low to start a draw");
      const nowSec = (await connection.getBlockTime(await connection.getSlot("confirmed"))) ?? Math.floor(Date.now() / 1000);
      const deadlineSec = poolAccount.nextDrawTimestamp.toNumber();
      if (nowSec <= deadlineSec) return skip("Round not due on-chain yet");
      const rules = {
        nowSec,
        deadlineSec,
        gracePeriodSeconds: poolAccount.gracePeriodSeconds.toNumber(),
        stakeEnabled: poolAccount.stakeEnabled as boolean,
      };
      const seatsOf = async () => {
        const [members, payments] = await Promise.all([
          readMembers(),
          connection.getMultipleAccountsInfo(
            roster.map((wallet) => getPaymentPDA(poolAddress, wallet, round)[0]),
            "confirmed"
          ),
        ]);
        return roster.map((wallet, i) => ({
          wallet: wallet.toBase58(),
          paid: !!payments[i] && payments[i]!.owner.equals(program.programId) && payments[i]!.data.length > 0,
          isKicked: members[i]?.isKicked ?? true,
          inGracePeriod: !!members[i]?.inGracePeriod,
          inDefault: !!members[i]?.inDefault,
          graceDeadline: members[i]?.graceDeadline ? Number(members[i]!.graceDeadline.toString()) : 0,
        }));
      };

      const { toMark } = settleRound(await seatsOf(), rules);
      for (let i = 0; i < toMark.length; i += MARK_BATCH) {
        const markTx = new Transaction();
        for (const address of toMark.slice(i, i + MARK_BATCH)) {
          const wallet = new PublicKey(address);
          markTx.add(
            await program.methods
              .markDefaulter()
              .accounts({
                caller: keypair.publicKey,
                pool: poolAddress,
                member: getMemberPDA(poolAddress, wallet)[0],
                payment: getPaymentPDA(poolAddress, wallet, round)[0],
                vault: getVaultPDA(poolAddress)[0],
                systemProgram: SystemProgram.programId,
              })
              .instruction()
          );
        }
        await sendSchedulerTx(connection, keypair, markTx);
        console.log(`Marked ${Math.min(MARK_BATCH, toMark.length - i)} missed payment(s) in ${poolAddress.toBase58()}`);
      }

      const { waiting } = settleRound(await seatsOf(), rules);
      if (waiting.length > 0) return skip(`Waiting for ${waiting.length} seat(s) in grace to pay`);
    }

    const eligibleNow = async () => {
      const members = await readMembers();
      return roster.filter((wallet, i) => {
        const member = members[i];
        return (
          !!member &&
          isDrawEligible({
            wallet,
            hasWon: member.hasWon,
            inDefault: member.inDefault,
            isKicked: member.isKicked,
            inGracePeriod: member.inGracePeriod,
          })
        );
      });
    };
    // Nobody left to win: never commit, the commit can't be undone
    if ((await eligibleNow()).length === 0) return skip("No eligible members");

    const [vaultPDA] = getVaultPDA(poolAddress);
    const vaultFor = async () => {
      const members = await readMembers();
      const balance = BigInt(await connection.getBalance(vaultPDA, "confirmed"));
      const pot = BigInt(poolAccount.contributionAmount.toString()) * BigInt(poolAccount.memberCount);
      const owed = members.reduce(
        (sum, m) => sum + (m?.stakeDeposited ? BigInt(m.stakeAmount.toString()) : BigInt(0)),
        BigInt(0)
      );
      return { balance, pot, ok: balance - pot >= owed, covers: balance >= pot };
    };

    if (poolAccount.randomnessRound !== round) {
      // The pot must come from this round's payments and slashed stakes, never stakes owed back
      if (!(await vaultFor()).ok) return skip("Vault can't cover the pot without spending stakes");
      const commitTx = await program.methods
        .commitDrawRandomness()
        .accounts({
          caller: keypair.publicKey,
          pool: poolAddress,
        })
        .transaction();
      await sendSchedulerTx(connection, keypair, commitTx);
      poolAccount = await accounts.pool.fetch(poolAddress);
      // The commit takes no round: if it landed on another one, leave it for that round's run
      if (!("active" in poolAccount.status) || poolAccount.currentRound !== round || poolAccount.randomnessRound !== round) {
        throw new Error(`Commit landed outside round ${round}`);
      }
    }

    if (balance < MIN_BALANCE_TO_FINISH) return skip("Scheduler balance too low to finish a draw");
    const committedSlot = BigInt(poolAccount.randomnessSlot.toString());
    const expiresAt = committedSlot + BigInt(SLOT_HASH_WINDOW);
    const started = Date.now();
    let hash: Uint8Array | null = null;
    while (Date.now() - started < 30_000) {
      const [info, slot] = await Promise.all([
        connection.getAccountInfo(SLOT_HASHES_SYSVAR),
        connection.getSlot("confirmed"),
      ]);
      hash = info ? readSlotHash(info.data, committedSlot) : null;
      if (hash) break;
      // An expired commit can never be finished: don't spend the run waiting on it
      if (BigInt(slot) > expiresAt) return skip("Draw expired before it was finished (circle locked)");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!hash) {
      throw new Error("Committed slot hash was not available");
    }

    const eligible = await eligibleNow();
    const derivedWinner = selectDerivedWinner(hash, eligible);
    const [drawPDA] = getDrawPDA(poolAddress, round);
    // Once committed, finishing is the only way to keep the circle going: only require the pot
    const vault = await vaultFor();
    if (!vault.covers) throw new Error("Vault can't cover the pot");
    const executeTx = await program.methods
      .executeDraw()
      .accounts({
        authority: keypair.publicKey,
        pool: poolAddress,
        winnerWallet: derivedWinner,
        draw: drawPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
        slotHashes: SLOT_HASHES_SYSVAR,
      })
      .remainingAccounts(
        memberAccounts.map((pubkey) => ({
          pubkey,
          isWritable: true,
          isSigner: false,
        }))
      )
      .transaction();
    const before = [ComputeBudgetProgram.setComputeUnitLimit({ units: DRAW_COMPUTE_UNITS })];
    const left = vault.balance - vault.pot;
    if (left > BigInt(0) && left < BigInt(RENT_EXEMPT_EMPTY)) {
      // Dust in the vault would leave it below rent after the payout
      before.push(
        SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: vaultPDA, lamports: RENT_EXEMPT_EMPTY - Number(left) })
      );
    }
    executeTx.instructions.unshift(...before);
    const signature = await sendSchedulerTx(connection, keypair, executeTx);

    return {
      poolAddress: poolAddress.toBase58(),
      round,
      winner: derivedWinner.toBase58(),
      amount: pool.contributionAmount * pool.memberCount,
      signature,
      success: true,
    };
  } catch (error: any) {
    console.error(`Draw execution failed for pool ${poolAddress.toBase58()}:`, error.message);
    return {
      poolAddress: poolAddress.toBase58(),
      round: pool.currentRound,
      winner: "",
      amount: 0,
      signature: "",
      success: false,
      error: error.message,
    };
  }
}

// ============ Main Scheduler Function ============

/**
 * Process all pools that are ready for draw
 * This is the main entry point called by the cron job
 */
export async function processDraws(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: DrawResult[];
}> {
  console.log("=== Starting Draw Scheduler ===");
  console.log(`Time: ${new Date().toISOString()}`);

  const results: DrawResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Setup
    const connection = getConnection();
    const keypair = getSchedulerKeypair();
    const program = getSchedulerProgram(connection, keypair);

    console.log(`Scheduler wallet: ${keypair.publicKey.toBase58()}`);

    // Check wallet balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Scheduler balance: ${balance / 1e9} SOL`);

    if (balance < 0.05 * 1e9) {
      console.warn("Warning: Scheduler wallet balance is low! Below 0.005 SOL it stops starting draws.");
    }

    // Get pools ready for draw
    const pools = await getPoolsReadyForDraw(program);

    // Process each pool
    for (const pool of pools) {
      console.log(`\nProcessing pool: ${pool.name} (${pool.address.toBase58()})`);

      const result = await executeDraw(connection, program, keypair, pool);
      results.push(result);

      if (result.success) {
        successful++;
      } else if (result.skipped) {
        skipped++;
      } else {
        failed++;
      }

      // Small delay between draws to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } catch (error: any) {
    console.error("Scheduler error:", error.message);
  }

  console.log(`\n=== Scheduler Complete ===`);
  console.log(`Processed: ${results.length}, Successful: ${successful}, Skipped: ${skipped}, Failed: ${failed}`);

  return {
    processed: results.length,
    successful,
    failed,
    skipped,
    results,
  };
}
