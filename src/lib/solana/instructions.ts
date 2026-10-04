import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
} from "@solana/web3.js";
import { SLOT_HASHES_SYSVAR } from "./bound-draw";
import {
  getCreatorStatsPDA,
  getPoolPDA,
  getVaultPDA,
  getMemberPDA,
  getPaymentPDA,
  getDrawPDA,
  solToLamports,
  toTokenUnits,
} from "./program";

// Type helper for accessing dynamic account namespace
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AccountNamespace = any;

// ============ Create Pool ============

export interface CreatePoolParams {
  name: string;
  maxMembers: number;
  contributionAmount: number; // In SOL or token units
  currency: "SOL" | "USDC" | "USDT";
  stakeMultiplier: 1 | 2 | 3;
  stakeEnabled?: boolean; // Default true
  autoMode?: boolean; // Default false - pre-fund all payments on join, auto-start when full
}

export async function buildCreatePoolTransaction(
  program: Program,
  authority: PublicKey,
  params: CreatePoolParams
): Promise<{ transaction: Transaction; poolAddress: PublicKey }> {
  // Get creator stats PDA
  const [creatorStatsPDA] = getCreatorStatsPDA(authority);

  // Fetch existing creator stats to get pool count, otherwise default to 0
  let poolIndex = new BN(0);
  try {
    // First try Anchor's typed fetch
    const accounts = program.account as AccountNamespace;
    const creatorStats = await accounts.creatorStats.fetch(creatorStatsPDA);
    poolIndex = (creatorStats as { poolCount: BN }).poolCount;
    console.log("Existing creator stats found via Anchor, pool_count:", poolIndex.toString());
  } catch (e) {
    // Anchor fetch failed - try raw account fetch
    // This handles cases where discriminator changed but account data is still valid
    try {
      const connection = program.provider.connection;
      const accountInfo = await connection.getAccountInfo(creatorStatsPDA);
      if (accountInfo && accountInfo.data.length >= 16) {
        // CreatorStats layout: 8 bytes discriminator + 8 bytes pool_count (u64 LE) + 1 byte bump
        // Read pool_count as little-endian u64 starting at byte 8
        const poolCountBytes = accountInfo.data.slice(8, 16);
        poolIndex = new BN(poolCountBytes, 'le');
        console.log("Existing creator stats found via raw fetch, pool_count:", poolIndex.toString());
      } else {
        console.log("No creator stats account found, using pool_index 0");
      }
    } catch (rawError) {
      console.log("No creator stats found, using pool_index 0");
    }
  }

  // Derive pool and vault PDAs using the correct pool index
  const [poolPDA] = getPoolPDA(authority, poolIndex);
  const [vaultPDA] = getVaultPDA(poolPDA);

  console.log("Creating pool with:");
  console.log("  authority:", authority.toBase58());
  console.log("  creatorStats:", creatorStatsPDA.toBase58());
  console.log("  poolIndex:", poolIndex.toString());
  console.log("  poolPDA:", poolPDA.toBase58());
  console.log("  vaultPDA:", vaultPDA.toBase58());

  // Convert currency string to number
  const currencyMap: Record<string, number> = { SOL: 0, USDC: 1, USDT: 2 };
  const currencyNum = currencyMap[params.currency];

  // Convert contribution amount to appropriate units
  const contributionAmount =
    params.currency === "SOL"
      ? solToLamports(params.contributionAmount)
      : toTokenUnits(params.contributionAmount, 6);

  const stakeEnabled = params.stakeEnabled ?? true; // Default to true
  const autoMode = params.autoMode ?? false; // Default to false

  const ix = await program.methods
    .createPool(
      params.name,
      params.maxMembers,
      contributionAmount,
      currencyNum,
      params.stakeMultiplier,
      stakeEnabled,
      autoMode
    )
    .accounts({
      authority,
      creatorStats: creatorStatsPDA,
      pool: poolPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = new Transaction().add(ix);
  return { transaction, poolAddress: poolPDA };
}

// ============ Join Pool ============

export interface JoinPoolParams {
  poolAddress: PublicKey;
  inviteCode: string;
}

export async function buildJoinPoolTransaction(
  program: Program,
  user: PublicKey,
  params: JoinPoolParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .joinPool(params.inviteCode)
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Deposit Stake ============

export interface DepositStakeParams {
  poolAddress: PublicKey;
}

export async function buildDepositStakeTransaction(
  program: Program,
  user: PublicKey,
  params: DepositStakeParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .depositStake()
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Start Pool ============

export interface StartPoolParams {
  poolAddress: PublicKey;
}

export async function buildStartPoolTransaction(
  program: Program,
  authority: PublicKey,
  params: StartPoolParams
): Promise<Transaction> {
  const ix = await program.methods
    .startPool()
    .accounts({
      authority,
      pool: params.poolAddress,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Leave Pool ============

export interface LeavePoolParams {
  poolAddress: PublicKey;
}

export async function buildLeavePoolTransaction(
  program: Program,
  user: PublicKey,
  params: LeavePoolParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .leavePool()
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Make Payment ============

export interface MakePaymentParams {
  poolAddress: PublicKey;
  round: number;
}

export async function buildMakePaymentTransaction(
  program: Program,
  user: PublicKey,
  params: MakePaymentParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [paymentPDA] = getPaymentPDA(params.poolAddress, user, params.round);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .makePayment()
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      payment: paymentPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Execute Draw ============

export interface ExecuteDrawParams {
  poolAddress: PublicKey;
  round: number;
  /** Wallet derived from the committed slot hash. The program rejects any other. */
  derivedWinner: PublicKey;
  /** Every roster member PDA. Order does not select the winner. */
  memberAccounts: PublicKey[];
}

export async function buildCommitDrawTransaction(
  program: Program,
  caller: PublicKey,
  poolAddress: PublicKey
): Promise<Transaction> {
  const ix = await program.methods
    .commitDrawRandomness()
    .accounts({
      caller,
      pool: poolAddress,
    })
    .instruction();

  return new Transaction().add(ix);
}

export async function buildExecuteDrawTransaction(
  program: Program,
  authority: PublicKey,
  params: ExecuteDrawParams
): Promise<Transaction> {
  const [drawPDA] = getDrawPDA(params.poolAddress, params.round);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .executeDraw()
    .accounts({
      authority,
      pool: params.poolAddress,
      winnerWallet: params.derivedWinner,
      draw: drawPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
      slotHashes: SLOT_HASHES_SYSVAR,
    })
    .remainingAccounts(
      params.memberAccounts.map((pubkey) => ({
        pubkey,
        isWritable: true,
        isSigner: false,
      }))
    )
    .instruction();

  return new Transaction().add(ix);
}

// ============ Claim Winnings ============

export interface ClaimWinningsParams {
  poolAddress: PublicKey;
  round: number;
}

export async function buildClaimWinningsTransaction(
  program: Program,
  winner: PublicKey,
  params: ClaimWinningsParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, winner);
  const [drawPDA] = getDrawPDA(params.poolAddress, params.round);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .claimWinnings()
    .accounts({
      user: winner,
      pool: params.poolAddress,
      member: memberPDA,
      draw: drawPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Claim Stake Refund ============

export interface ClaimStakeRefundParams {
  poolAddress: PublicKey;
}

export async function buildClaimStakeRefundTransaction(
  program: Program,
  user: PublicKey,
  params: ClaimStakeRefundParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .claimStakeRefund()
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Helper: Get transaction signature link ============

export function getExplorerLink(
  signature: string,
  network: "devnet" | "mainnet-beta" = "devnet"
): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${network}`;
}

export function getAddressLink(
  address: string | PublicKey,
  network: "devnet" | "mainnet-beta" = "devnet"
): string {
  const addr = typeof address === "string" ? address : address.toBase58();
  return `https://explorer.solana.com/address/${addr}?cluster=${network}`;
}

// Transaction result type for use with toasts
export interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerLink?: string;
  error?: string;
  logs?: string[];
  /** Base64 return data from the transaction, when requested. */
  returnData?: string;
}

// ============ Mark Defaulter ============

export interface MarkDefaulterParams {
  poolAddress: PublicKey;
  memberWallet: PublicKey;
  round: number;
}

export async function buildMarkDefaulterTransaction(
  program: Program,
  caller: PublicKey,
  params: MarkDefaulterParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, params.memberWallet);
  const [paymentPDA] = getPaymentPDA(params.poolAddress, params.memberWallet, params.round);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .markDefaulter()
    .accounts({
      caller,
      pool: params.poolAddress,
      member: memberPDA,
      payment: paymentPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Rejoin Pool ============

export interface RejoinPoolParams {
  poolAddress: PublicKey;
}

export async function buildRejoinPoolTransaction(
  program: Program,
  user: PublicKey,
  params: RejoinPoolParams
): Promise<Transaction> {
  const [memberPDA] = getMemberPDA(params.poolAddress, user);
  const [vaultPDA] = getVaultPDA(params.poolAddress);

  const ix = await program.methods
    .rejoinPool()
    .accounts({
      user,
      pool: params.poolAddress,
      member: memberPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return new Transaction().add(ix);
}

// ============ Refund All Stakes ============

export interface RefundAllStakesParams {
  poolAddress: PublicKey;
  /** Members whose stake is still deposited. One instruction each. */
  memberWallets: PublicKey[];
}

export async function buildRefundAllStakesTransaction(
  program: Program,
  payer: PublicKey,
  params: RefundAllStakesParams
): Promise<Transaction> {
  const [vaultPDA] = getVaultPDA(params.poolAddress);
  const transaction = new Transaction();

  for (const memberWallet of params.memberWallets) {
    const [memberPDA] = getMemberPDA(params.poolAddress, memberWallet);
    const ix = await program.methods
      .refundAllStakes()
      .accounts({
        payer,
        pool: params.poolAddress,
        member: memberPDA,
        memberWallet,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    transaction.add(ix);
  }

  return transaction;
}
