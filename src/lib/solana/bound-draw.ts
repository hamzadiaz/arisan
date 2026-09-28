import { PublicKey } from "@solana/web3.js";

/** SlotHashes sysvar. The program reads the committed slot from this account. */
export const SLOT_HASHES_SYSVAR = new PublicKey(
  "SysvarS1otHashes111111111111111111111111111"
);

export interface EligibleMemberAccount {
  wallet: PublicKey;
  hasWon: boolean;
  inDefault: boolean;
  isKicked: boolean;
  inGracePeriod: boolean;
}

/**
 * Winner index is `u64-le(hash[0..8]) % eligible.length` after sorting wallets
 * by raw pubkey bytes. This matches `draw_randomness::select_winner`.
 */
export function selectDerivedWinner(hash: Uint8Array, wallets: PublicKey[]): PublicKey {
  if (wallets.length === 0) {
    throw new Error("No eligible members");
  }
  if (hash.length < 8) {
    throw new Error("Slot hash is too short");
  }
  const sorted = [...wallets].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
  const n = Buffer.from(hash.subarray(0, 8)).readBigUInt64LE(0);
  const idx = Number(n % BigInt(sorted.length));
  return sorted[idx];
}

/** Parse one slot hash out of the SlotHashes sysvar (newest entry first). */
export function readSlotHash(data: Uint8Array, targetSlot: bigint): Uint8Array | null {
  if (data.length < 8) return null;
  const declared = Number(Buffer.from(data.subarray(0, 8)).readBigUInt64LE(0));
  const entryLen = 40;
  const available = Math.floor((data.length - 8) / entryLen);
  const count = Math.min(declared, available);
  for (let i = 0; i < count; i++) {
    const off = 8 + i * entryLen;
    const slot = Buffer.from(data.subarray(off, off + 8)).readBigUInt64LE(0);
    if (slot === targetSlot) {
      return data.subarray(off + 8, off + 40);
    }
    if (slot < targetSlot) return null;
  }
  return null;
}

export function isDrawEligible(member: EligibleMemberAccount): boolean {
  return !member.hasWon && !member.inDefault && !member.isKicked && !member.inGracePeriod;
}
