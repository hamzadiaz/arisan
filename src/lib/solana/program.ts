import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Commitment } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "./idl.json";

// Program ID from the deployed contract
export const PROGRAM_ID = new PublicKey(
  "BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6"
);

// Account seeds for PDA derivation - must match Rust program exactly
export const SEEDS = {
  // "pool" = [112, 111, 111, 108]
  POOL: new Uint8Array([112, 111, 111, 108]),
  // "vault" = [118, 97, 117, 108, 116]
  VAULT: new Uint8Array([118, 97, 117, 108, 116]),
  // "member" = [109, 101, 109, 98, 101, 114]
  MEMBER: new Uint8Array([109, 101, 109, 98, 101, 114]),
  // "payment" = [112, 97, 121, 109, 101, 110, 116]
  PAYMENT: new Uint8Array([112, 97, 121, 109, 101, 110, 116]),
  // "draw" = [100, 114, 97, 119]
  DRAW: new Uint8Array([100, 114, 97, 119]),
  // "creator" = [99, 114, 101, 97, 116, 111, 114] - NOTE: Rust uses "creator" not "creator_stats"!
  CREATOR_STATS: new Uint8Array([99, 114, 101, 97, 116, 111, 114]),
} as const;

// Currency enum mapping (matches on-chain)
export enum Currency {
  SOL = 0,
  USDC = 1,
  USDT = 2,
}

// Pool status enum mapping (matches on-chain)
export enum PoolStatus {
  Pending = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
}

// On-chain Pool data structure
export interface OnChainPool {
  authority: PublicKey;
  name: number[]; // [u8; 32]
  maxMembers: number;
  memberCount: number;
  contributionAmount: BN;
  currency: { sol?: {} } | { usdc?: {} } | { usdt?: {} };
  totalRounds: number;
  currentRound: number;
  status: { pending?: {} } | { active?: {} } | { completed?: {} } | { cancelled?: {} };
  nextDrawTimestamp: BN;
  inviteCodeHash: number[]; // [u8; 32] SHA256 hash - cannot be decoded back to plaintext
  stakeMultiplier: number;
  bump: number;
  vaultBump: number;
  tokenVault: PublicKey;
  createdAt: BN;
  poolIndex: BN;
  // New fields for defaulter handling
  stakeEnabled: boolean;
  gracePeriodSeconds: BN;
  // Auto mode field
  autoMode: boolean;
}

// On-chain Member data structure
export interface OnChainMember {
  pool: PublicKey;
  wallet: PublicKey;
  hasWon: boolean;
  wonRound: number;
  stakeDeposited: boolean;
  stakeAmount: BN;
  paymentsMade: number;
  joinedAt: BN;
  position: number;
  bump: number;
  // New fields for defaulter handling
  inDefault: boolean;
  inGracePeriod: boolean;
  graceDeadline: BN;
  isKicked: boolean;
  missedRounds: number;
}

// On-chain Payment data structure
export interface OnChainPayment {
  pool: PublicKey;
  member: PublicKey;
  round: number;
  amount: BN;
  paidAt: BN;
  bump: number;
}

// On-chain Draw data structure
export interface OnChainDraw {
  pool: PublicKey;
  round: number;
  winner: PublicKey;
  amount: BN;
  vrfResult: number[]; // [u8; 32]
  drawnAt: BN;
  claimed: boolean;
  bump: number;
}

// On-chain CreatorStats data structure
export interface OnChainCreatorStats {
  poolCount: BN;
  bump: number;
}

// Helper to decode pool name from bytes
export function decodePoolName(nameBytes: number[]): string {
  const bytes = nameBytes.filter((b) => b !== 0);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// DEPRECATED: Invite codes are now stored as SHA256 hashes and cannot be decoded
// The plaintext invite code is only available from the PoolCreated event at creation time
// @deprecated Use event logs from pool creation transaction to get invite code
export function decodeInviteCode(codeBytes: number[]): string {
  // This will return garbage for hashed values - only kept for backward compatibility
  console.warn("decodeInviteCode is deprecated - invite codes are now hashed");
  return String.fromCharCode(...codeBytes.filter((b) => b !== 0));
}

// Helper to get currency string from on-chain enum
export function getCurrencyString(
  currency: { sol?: {} } | { usdc?: {} } | { usdt?: {} }
): "SOL" | "USDC" | "USDT" {
  if ("sol" in currency) return "SOL";
  if ("usdc" in currency) return "USDC";
  return "USDT";
}

// Helper to get pool status string from on-chain enum
export function getPoolStatusString(
  status: { pending?: {} } | { active?: {} } | { completed?: {} } | { cancelled?: {} }
): "pending" | "active" | "completed" | "cancelled" {
  if ("pending" in status) return "pending";
  if ("active" in status) return "active";
  if ("completed" in status) return "completed";
  return "cancelled";
}

// Create Anchor Provider (requires wallet)
export function createProvider(
  connection: Connection,
  wallet: AnchorWallet,
  opts?: { commitment?: Commitment }
): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: opts?.commitment || "confirmed",
    preflightCommitment: opts?.commitment || "confirmed",
  });
}

// Get the Arisan program instance
export function getProgram(provider: AnchorProvider): Program {
  return new Program(idl as Idl, provider);
}

// PDA derivation functions

export function getCreatorStatsPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CREATOR_STATS, authority.toBytes()],
    PROGRAM_ID
  );
}

export function getPoolPDA(
  authority: PublicKey,
  poolIndex: number | BN
): [PublicKey, number] {
  const idx = typeof poolIndex === "number" ? new BN(poolIndex) : poolIndex;
  // Convert BN to 8-byte little-endian Uint8Array
  const indexBuffer = new Uint8Array(8);
  const bnArray = idx.toArray("le", 8);
  indexBuffer.set(bnArray);

  return PublicKey.findProgramAddressSync(
    [SEEDS.POOL, authority.toBytes(), indexBuffer],
    PROGRAM_ID
  );
}

export function getVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.VAULT, pool.toBytes()],
    PROGRAM_ID
  );
}

export function getMemberPDA(
  pool: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.MEMBER, pool.toBytes(), wallet.toBytes()],
    PROGRAM_ID
  );
}

export function getPaymentPDA(
  pool: PublicKey,
  wallet: PublicKey,
  round: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.PAYMENT, pool.toBytes(), wallet.toBytes(), new Uint8Array([round])],
    PROGRAM_ID
  );
}

export function getDrawPDA(pool: PublicKey, round: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.DRAW, pool.toBytes(), new Uint8Array([round])],
    PROGRAM_ID
  );
}

// Convert lamports to SOL
export function lamportsToSol(lamports: BN | number): number {
  const value = typeof lamports === "number" ? lamports : lamports.toNumber();
  return value / 1_000_000_000;
}

// Convert SOL to lamports
export function solToLamports(sol: number): BN {
  return new BN(Math.floor(sol * 1_000_000_000));
}

// Convert to token units (6 decimals for USDC/USDT)
export function toTokenUnits(amount: number, decimals: number = 6): BN {
  return new BN(Math.floor(amount * Math.pow(10, decimals)));
}

// Convert from token units
export function fromTokenUnits(units: BN | number, decimals: number = 6): number {
  const value = typeof units === "number" ? units : units.toNumber();
  return value / Math.pow(10, decimals);
}
