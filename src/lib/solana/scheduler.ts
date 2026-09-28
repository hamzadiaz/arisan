/**
 * Arisan Auto-Draw Scheduler
 *
 * Backend utilities for automatically executing draws when deadlines pass.
 * Used by the Vercel cron job to trigger draws without user intervention.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, OnChainPool, OnChainMember, getPoolStatusString, getDrawPDA, getVaultPDA, getMemberPDA } from "./program";
import { SLOT_HASHES_SYSVAR, isDrawEligible, readSlotHash, selectDerivedWinner } from "./bound-draw";
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
  error?: string;
}

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

        // Decode the pool using Anchor's coder
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coder = (program as any).coder;
        const pool = coder.accounts.decode("pool", account.data) as unknown as OnChainPool;
        const status = getPoolStatusString(pool.status);

        console.log(`Pool ${pubkey.toBase58().slice(0, 8)}... - status: ${status}, autoMode: ${pool.autoMode}, nextDraw: ${pool.nextDrawTimestamp.toNumber()}, now: ${now}`);

        // Check conditions:
        // 1. Pool is active
        // 2. Auto mode is enabled
        // 3. Draw deadline has passed
        if (
          status === "active" &&
          pool.autoMode &&
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
  return readyPools;
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

    if (poolAccount.randomnessRound !== round) {
      const commitTx = await program.methods
        .commitDrawRandomness()
        .accounts({
          caller: keypair.publicKey,
          pool: poolAddress,
        })
        .transaction();
      await sendSchedulerTx(connection, keypair, commitTx);
      poolAccount = await accounts.pool.fetch(poolAddress);
    }

    const committedSlot = BigInt(poolAccount.randomnessSlot.toString());
    const started = Date.now();
    let hash: Uint8Array | null = null;
    while (Date.now() - started < 30_000) {
      const info = await connection.getAccountInfo(SLOT_HASHES_SYSVAR);
      hash = info ? readSlotHash(info.data, committedSlot) : null;
      if (hash) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!hash) {
      throw new Error("Committed slot hash was not available");
    }

    const roster: PublicKey[] = (poolAccount.memberWallets as PublicKey[]).slice(
      0,
      poolAccount.rosterLen as number
    );
    const memberAccounts: PublicKey[] = [];
    const eligible: PublicKey[] = [];
    for (const wallet of roster) {
      if (wallet.equals(PublicKey.default)) continue;
      const [memberPDA] = getMemberPDA(poolAddress, wallet);
      memberAccounts.push(memberPDA);
      const member = (await accounts.member.fetch(memberPDA)) as OnChainMember;
      if (
        isDrawEligible({
          wallet,
          hasWon: member.hasWon,
          inDefault: member.inDefault,
          isKicked: member.isKicked,
          inGracePeriod: member.inGracePeriod,
        })
      ) {
        eligible.push(wallet);
      }
    }

    const derivedWinner = selectDerivedWinner(hash, eligible);
    const [drawPDA] = getDrawPDA(poolAddress, round);
    const [vaultPDA] = getVaultPDA(poolAddress);
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
  results: DrawResult[];
}> {
  console.log("=== Starting Draw Scheduler ===");
  console.log(`Time: ${new Date().toISOString()}`);

  const results: DrawResult[] = [];
  let successful = 0;
  let failed = 0;

  try {
    // Setup
    const connection = getConnection();
    const keypair = getSchedulerKeypair();
    const program = getSchedulerProgram(connection, keypair);

    console.log(`Scheduler wallet: ${keypair.publicKey.toBase58()}`);

    // Check wallet balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Scheduler balance: ${balance / 1e9} SOL`);

    if (balance < 0.001 * 1e9) {
      console.warn("Warning: Scheduler wallet balance is low!");
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
  console.log(`Processed: ${results.length}, Successful: ${successful}, Failed: ${failed}`);

  return {
    processed: results.length,
    successful,
    failed,
    results,
  };
}
