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

// ============ Pool Account Fetching ============

export interface FetchedPool extends Pool {
  onChainAddress: string;
  vaultAddress: string;
  vaultBalance: number;
}

export async function fetchPool(
  program: Program,
  poolAddress: PublicKey
): Promise<FetchedPool | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    };
  } catch (error) {
    // Check if this is a buffer/deserialization error (likely old pool format)
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("buffer") || errorMsg.includes("RangeError")) {
      console.warn(`Skipping pool ${poolAddress.toBase58()}: incompatible format (likely old schema)`);
    } else {
      console.error("Failed to fetch pool:", error);
    }
    return null;
  }
}

// Fetch pool by invite code (hashes input and compares against stored hash)
// Note: Invite codes are now stored as SHA256 hashes for security
export async function fetchPoolByInviteCode(
  program: Program,
  inviteCode: string
): Promise<FetchedPool | null> {
  try {
    const accounts = program.account as AccountNamespace;
    const allPools = await accounts.pool.all();

    // Hash the input invite code using Web Crypto API (SHA-256)
    const encoder = new TextEncoder();
    const data = encoder.encode(inviteCode);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
    const inputHash = new Uint8Array(hashBuffer);

    for (const { publicKey, account } of allPools) {
      try {
        const pool = account as unknown as OnChainPool;

        // Check if pool has the new invite_code_hash field (32 bytes)
        if (!pool.inviteCodeHash || pool.inviteCodeHash.length !== 32) {
          // Old pool format - skip
          continue;
        }

        const storedHash = new Uint8Array(pool.inviteCodeHash);

        // Compare hashes
        if (inputHash.length === storedHash.length &&
            inputHash.every((byte, i) => byte === storedHash[i])) {
          return fetchPool(program, publicKey);
        }
      } catch {
        // Skip pools that can't be parsed (old format)
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch pool by invite code:", error);
    return null;
  }
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
    console.error("Failed to fetch user pools:", error);
    return [];
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    console.error("Failed to fetch pool members:", error);
    return [];
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    console.error("Failed to fetch pool payments:", error);
    return [];
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    const poolAccount = await accounts.pool.fetch(poolAddress);
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
    console.error("Failed to fetch pool draws:", error);
    return [];
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
