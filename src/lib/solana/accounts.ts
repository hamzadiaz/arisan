import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import {
  PROGRAM_ID,
  OnChainPool,
  OnChainMember,
  OnChainPayment,
  OnChainDraw,
  OnChainCreatorStats,
  decodePoolName,
  getCurrencyString,
  getPoolStatusString,
  getCreatorStatsPDA,
  getMemberPDA,
  getPaymentPDA,
  getDrawPDA,
  getVaultPDA,
  lamportsToSol,
  fromTokenUnits,
} from "./program";
import { Pool, PoolMember, Payment, Draw, Currency, PoolStatus } from "@/types";

// Type helper for accessing dynamic account namespace
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AccountNamespace = any;

/**
 * The RPC could not be reached or refused the request. Callers show a retryable
 * network error instead of reporting the account as missing.
 */
export class ChainUnavailableError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ChainUnavailableError";
  }
}

// Old pool layouts fail to decode; those are skipped rather than treated as outages.
function isDecodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error instanceof RangeError ||
    /buffer|discriminator|decode|out of range/i.test(message)
  );
}

// ============ Pool Account Fetching ============

export interface FetchedPool extends Pool {
  onChainAddress: string;
  vaultAddress: string;
  vaultBalance: number;
  /** Seats taken, excluding kicked members. The pot pays contribution × this. */
  memberCount: number;
  /** Stake per member = contribution × this, when stakes are on. */
  stakeMultiplier: number;
  /** Round whose draw randomness is committed; equals currentRound mid-draw. */
  randomnessRound: number;
  randomnessSlot: number;
  /** SHA-256 of the invite code; the code itself isn't in the account */
  inviteCodeHash?: number[];
}

export async function fetchPool(
  program: Program,
  poolAddress: PublicKey
): Promise<FetchedPool | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    if (!poolAccount) return null;
    const pool = poolAccount as unknown as OnChainPool;

    // Get vault balance
    const [vaultPDA] = getVaultPDA(poolAddress);
    const vaultBalance = await program.provider.connection.getBalance(vaultPDA);

    const currency = getCurrencyString(pool.currency);
    const status = getPoolStatusString(pool.status);

    return {
      id: poolAddress.toBase58(),
      onChainAddress: poolAddress.toBase58(),
      vaultAddress: vaultPDA.toBase58(),
      vaultBalance:
        currency === "SOL"
          ? lamportsToSol(vaultBalance)
          : fromTokenUnits(vaultBalance, 6),
      name: decodePoolName(pool.name),
      creatorId: pool.authority.toBase58(),
      maxMembers: pool.maxMembers,
      monthlyAmount:
        currency === "SOL"
          ? lamportsToSol(pool.contributionAmount)
          : fromTokenUnits(pool.contributionAmount, 6),
      currency: currency as Currency,
      durationMonths: pool.totalRounds,
      currentRound: pool.currentRound,
      status: status as PoolStatus,
      inviteCode: "", // Invite codes are now hashed on-chain and cannot be retrieved
      createdAt: new Date(pool.createdAt.toNumber() * 1000),
      nextDrawDate: new Date(pool.nextDrawTimestamp.toNumber() * 1000),
      members: [], // Populated separately
      // Stake/defaulter handling fields
      stakeEnabled: pool.stakeEnabled,
      gracePeriodSeconds: pool.gracePeriodSeconds.toNumber(),
      // Auto mode field
      autoMode: pool.autoMode,
      memberCount: pool.memberCount,
      stakeMultiplier: pool.stakeMultiplier,
      randomnessRound: pool.randomnessRound ?? 0,
      randomnessSlot: pool.randomnessSlot ? pool.randomnessSlot.toNumber() : 0,
      inviteCodeHash: pool.inviteCodeHash ? Array.from(pool.inviteCodeHash) : undefined,
    };
  } catch (error) {
    // Check if this is a buffer/deserialization error (likely old pool format)
    if (isDecodeError(error)) {
      console.warn(`Skipping pool ${poolAddress.toBase58()}: incompatible format (likely old schema)`);
      return null;
    }
    throw new ChainUnavailableError(error);
  }
}

// Fetch pool by invite code (hashes input and compares against stored hash)
// Note: Invite codes are now stored as SHA256 hashes for security
export async function fetchPoolByInviteCode(
  program: Program,
  inviteCode: string
): Promise<FetchedPool | null> {
  // Decode each pool on its own: one old-layout pool must not fail the whole lookup.
  const poolName = program.idl.accounts?.find((a) => a.name.toLowerCase() === "pool")?.name ?? "pool";
  let rawPools: readonly { pubkey: PublicKey; account: AccountInfo<Buffer> }[];
  try {
    rawPools = await program.provider.connection.getProgramAccounts(program.programId, {
      filters: [{ memcmp: program.coder.accounts.memcmp(poolName) }],
    });
  } catch (error) {
    throw new ChainUnavailableError(error);
  }

  // Hash the input invite code using Web Crypto API (SHA-256)
  const encoder = new TextEncoder();
  const data = encoder.encode(inviteCode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  const inputHash = new Uint8Array(hashBuffer);

  for (const { pubkey, account } of rawPools) {
    let pool: OnChainPool;
    try {
      pool = program.coder.accounts.decode(poolName, account.data) as OnChainPool;
    } catch {
      continue; // Old pool format
    }
    if (!pool.inviteCodeHash || pool.inviteCodeHash.length !== 32) continue;

    const storedHash = new Uint8Array(pool.inviteCodeHash);
    if (inputHash.every((byte, i) => byte === storedHash[i])) {
      return fetchPool(program, pubkey);
    }
  }

  return null;
}

// Fetch all pools for a user (where they are a member)
export async function fetchUserPools(
  program: Program,
  walletAddress: PublicKey
): Promise<FetchedPool[]> {
  try {
    const accounts = program.account as AccountNamespace;
    // Fetch all member accounts for this wallet
    const memberAccounts = await accounts.member.all([
      {
        memcmp: {
          offset: 8 + 32, // discriminator + pool pubkey
          bytes: walletAddress.toBase58(),
        },
      },
    ]);

    // Fetch corresponding pools
    const pools: FetchedPool[] = [];
    for (const { account } of memberAccounts) {
      const member = account as unknown as OnChainMember;
      const pool = await fetchPool(program, member.pool);
      if (pool) {
        pools.push(pool);
      }
    }

    return pools.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    if (error instanceof ChainUnavailableError) throw error;
    throw new ChainUnavailableError(error);
  }
}

// ============ Member Account Fetching ============

export interface FetchedMember extends PoolMember {
  walletAddress: string;
  stakeAmount: number;
  position: number;
  // Defaulter handling fields
  inDefault: boolean;
  inGracePeriod: boolean;
  graceDeadline: Date | null;
  isKicked: boolean;
  missedRounds: number;
}

export async function fetchMember(
  program: Program,
  poolAddress: PublicKey,
  walletAddress: PublicKey
): Promise<FetchedMember | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const [memberPDA] = getMemberPDA(poolAddress, walletAddress);
    const memberAccount = await accounts.member.fetch(memberPDA);
    const member = memberAccount as unknown as OnChainMember;

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, no account to read
    if (!poolAccount) return null;
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    return {
      id: memberPDA.toBase58(),
      poolId: poolAddress.toBase58(),
      userId: walletAddress.toBase58(), // Using wallet as user ID for on-chain
      walletAddress: walletAddress.toBase58(),
      joinedAt: new Date(member.joinedAt.toNumber() * 1000),
      hasWon: member.hasWon,
      wonRound: member.wonRound > 0 ? member.wonRound : undefined,
      stakeDeposited: member.stakeDeposited,
      stakeAmount:
        currency === "SOL"
          ? lamportsToSol(member.stakeAmount)
          : fromTokenUnits(member.stakeAmount, 6),
      position: member.position,
      paymentHistory: [], // Populated separately
      // Defaulter handling fields
      inDefault: member.inDefault,
      inGracePeriod: member.inGracePeriod,
      graceDeadline: member.graceDeadline.toNumber() > 0
        ? new Date(member.graceDeadline.toNumber() * 1000)
        : null,
      isKicked: member.isKicked,
      missedRounds: member.missedRounds,
    };
  } catch {
    // Member account doesn't exist - user hasn't joined this pool
    return null;
  }
}

export async function fetchPoolMembers(
  program: Program,
  poolAddress: PublicKey
): Promise<FetchedMember[]> {
  try {
    const accounts = program.account as AccountNamespace;
    // Fetch all member accounts for this pool
    const memberAccounts = await accounts.member.all([
      {
        memcmp: {
          offset: 8, // discriminator
          bytes: poolAddress.toBase58(),
        },
      },
    ]);

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, nothing to list: the page shows "not found" from its own pool read
    if (!poolAccount) return [];
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    return memberAccounts.map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
      const member = account as OnChainMember;
      return {
        id: publicKey.toBase58(),
        poolId: poolAddress.toBase58(),
        userId: member.wallet.toBase58(),
        walletAddress: member.wallet.toBase58(),
        joinedAt: new Date(member.joinedAt.toNumber() * 1000),
        hasWon: member.hasWon,
        wonRound: member.wonRound > 0 ? member.wonRound : undefined,
        stakeDeposited: member.stakeDeposited,
        stakeAmount:
          currency === "SOL"
            ? lamportsToSol(member.stakeAmount)
            : fromTokenUnits(member.stakeAmount, 6),
        position: member.position,
        paymentHistory: [],
        // Defaulter handling fields
        inDefault: member.inDefault,
        inGracePeriod: member.inGracePeriod,
        graceDeadline: member.graceDeadline.toNumber() > 0
          ? new Date(member.graceDeadline.toNumber() * 1000)
          : null,
        isKicked: member.isKicked,
        missedRounds: member.missedRounds,
      };
    }).sort((a: FetchedMember, b: FetchedMember) => a.position - b.position);
  } catch (error) {
    // An old-layout account isn't an outage; an unreachable RPC is, and must not read as
    // "nobody paid" (the screen would offer Pay and Mark transactions that can only fail)
    if (isDecodeError(error)) {
      console.warn("Skipping old-format pool members:", error);
      return [];
    }
    throw new ChainUnavailableError(error);
  }
}

// ============ Payment Account Fetching ============

export interface FetchedPayment extends Payment {
  walletAddress: string;
}

export async function fetchPayment(
  program: Program,
  poolAddress: PublicKey,
  walletAddress: PublicKey,
  round: number
): Promise<FetchedPayment | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const [paymentPDA] = getPaymentPDA(poolAddress, walletAddress, round);
    const paymentAccount = await accounts.payment.fetch(paymentPDA);
    const payment = paymentAccount as unknown as OnChainPayment;

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, no account to read
    if (!poolAccount) return null;
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    return {
      id: paymentPDA.toBase58(),
      poolId: poolAddress.toBase58(),
      memberId: walletAddress.toBase58(),
      walletAddress: walletAddress.toBase58(),
      round: payment.round,
      amount:
        currency === "SOL"
          ? lamportsToSol(payment.amount)
          : fromTokenUnits(payment.amount, 6),
      status: "paid",
      dueDate: new Date(), // On-chain doesn't store due date
      paidAt: new Date(payment.paidAt.toNumber() * 1000),
      transactionSignature: paymentPDA.toBase58(),
    };
  } catch (error) {
    // Payment not found (not paid yet)
    return null;
  }
}

export async function fetchPoolPayments(
  program: Program,
  poolAddress: PublicKey,
  round?: number
): Promise<FetchedPayment[]> {
  try {
    const accounts = program.account as AccountNamespace;
    // Fetch all payment accounts for this pool
    const paymentAccounts = await accounts.payment.all([
      {
        memcmp: {
          offset: 8, // discriminator
          bytes: poolAddress.toBase58(),
        },
      },
    ]);

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, nothing to list: the page shows "not found" from its own pool read
    if (!poolAccount) return [];
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    let payments: FetchedPayment[] = paymentAccounts.map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
      const payment = account as OnChainPayment;
      return {
        id: publicKey.toBase58(),
        poolId: poolAddress.toBase58(),
        memberId: payment.member.toBase58(),
        walletAddress: payment.member.toBase58(),
        round: payment.round,
        amount:
          currency === "SOL"
            ? lamportsToSol(payment.amount)
            : fromTokenUnits(payment.amount, 6),
        status: "paid" as const,
        dueDate: new Date(),
        paidAt: new Date(payment.paidAt.toNumber() * 1000),
        transactionSignature: publicKey.toBase58(),
      };
    });

    // Filter by round if specified
    if (round !== undefined) {
      payments = payments.filter((p) => p.round === round);
    }

    return payments.sort((a, b) => b.paidAt!.getTime() - a.paidAt!.getTime());
  } catch (error) {
    // An old-layout account isn't an outage; an unreachable RPC is, and must not read as
    // "nobody paid" (the screen would offer Pay and Mark transactions that can only fail)
    if (isDecodeError(error)) {
      console.warn("Skipping old-format pool payments:", error);
      return [];
    }
    throw new ChainUnavailableError(error);
  }
}

// ============ Draw Account Fetching ============

export interface FetchedDraw extends Draw {
  claimed: boolean;
  vrfResultHex: string;
}

export async function fetchDraw(
  program: Program,
  poolAddress: PublicKey,
  round: number
): Promise<FetchedDraw | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const [drawPDA] = getDrawPDA(poolAddress, round);
    const drawAccount = await accounts.draw.fetch(drawPDA);
    const draw = drawAccount as unknown as OnChainDraw;

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, no account to read
    if (!poolAccount) return null;
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    return {
      id: drawPDA.toBase58(),
      poolId: poolAddress.toBase58(),
      round: draw.round,
      winnerId: draw.winner.toBase58(),
      winnerAddress: draw.winner.toBase58(),
      amount:
        currency === "SOL"
          ? lamportsToSol(draw.amount)
          : fromTokenUnits(draw.amount, 6),
      transactionSignature: drawPDA.toBase58(),
      vrfSeed: Buffer.from(draw.vrfResult).toString("hex"),
      vrfResultHex: Buffer.from(draw.vrfResult).toString("hex"),
      drawnAt: new Date(draw.drawnAt.toNumber() * 1000),
      claimed: draw.claimed,
    };
  } catch (error) {
    // Draw not found for this round
    return null;
  }
}

export async function fetchPoolDraws(
  program: Program,
  poolAddress: PublicKey
): Promise<FetchedDraw[]> {
  try {
    const accounts = program.account as AccountNamespace;

    // Check if draw account type exists in IDL
    if (!accounts.draw) {
      // Draw account type not in IDL - no draws yet
      return [];
    }

    // Fetch all draw accounts for this pool
    const drawAccounts = await accounts.draw.all([
      {
        memcmp: {
          offset: 8, // discriminator
          bytes: poolAddress.toBase58(),
        },
      },
    ]);

    // Get pool currency for proper conversion
    const poolAccount = await accounts.pool.fetchNullable(poolAddress);
    // No pool, nothing to list: the page shows "not found" from its own pool read
    if (!poolAccount) return [];
    const pool = poolAccount as unknown as OnChainPool;
    const currency = getCurrencyString(pool.currency);

    return drawAccounts
      .map(({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => {
        const draw = account as OnChainDraw;
        return {
          id: publicKey.toBase58(),
          poolId: poolAddress.toBase58(),
          round: draw.round,
          winnerId: draw.winner.toBase58(),
          winnerAddress: draw.winner.toBase58(),
          amount:
            currency === "SOL"
              ? lamportsToSol(draw.amount)
              : fromTokenUnits(draw.amount, 6),
          transactionSignature: publicKey.toBase58(),
          vrfSeed: Buffer.from(draw.vrfResult).toString("hex"),
          vrfResultHex: Buffer.from(draw.vrfResult).toString("hex"),
          drawnAt: new Date(draw.drawnAt.toNumber() * 1000),
          claimed: draw.claimed,
        };
      })
      .sort((a: FetchedDraw, b: FetchedDraw) => b.round - a.round);
  } catch (error) {
    // An old-layout account isn't an outage; an unreachable RPC is, and must not read as
    // "nobody paid" (the screen would offer Pay and Mark transactions that can only fail)
    if (isDecodeError(error)) {
      console.warn("Skipping old-format pool draws:", error);
      return [];
    }
    throw new ChainUnavailableError(error);
  }
}

// ============ Creator Stats Fetching ============

export async function fetchCreatorStats(
  program: Program,
  authority: PublicKey
): Promise<{ poolCount: number } | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const [statsPDA] = getCreatorStatsPDA(authority);

    const statsAccount = await accounts.creatorStats.fetch(statsPDA);
    const stats = statsAccount as unknown as OnChainCreatorStats;

    return {
      poolCount: stats.poolCount.toNumber(),
    };
  } catch {
    return null;
  }
}

// ============ Subscription Helpers ============

export function subscribeToAccount<T>(
  connection: Connection,
  accountAddress: PublicKey,
  callback: (accountInfo: AccountInfo<Buffer> | null) => void
): number {
  return connection.onAccountChange(accountAddress, (accountInfo) => {
    callback(accountInfo);
  });
}

export function unsubscribeFromAccount(
  connection: Connection,
  subscriptionId: number
): void {
  connection.removeAccountChangeListener(subscriptionId);
}
