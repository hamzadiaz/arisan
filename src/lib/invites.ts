import type { Connection, PublicKey } from "@solana/web3.js";

/**
 * A circle's invite code. The pool account keeps only its hash; the code itself comes back as
 * the create transaction's return data. This device remembers the codes it has seen (creating
 * or joining a circle), and on any other device the circle page reads a member's code back
 * from that create transaction.
 */
const KEY = "arisan.invites.v1";
const CHANGED = "arisan:invites";
// Covers the rest of the visit when localStorage is blocked
const memory = new Map<string, string>();

function stored(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function savedInvite(pool: string): string | null {
  const code = memory.get(pool) ?? stored()[pool];
  return typeof code === "string" ? code : null;
}

export function rememberInvite(pool: string, code: string) {
  if (savedInvite(pool) === code) return;
  memory.set(pool, code);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...stored(), [pool]: code }));
  } catch {
    // Private mode or full storage: the in-memory copy covers this visit
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeInvites(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

async function hashMatches(code: string, hash: number[]) {
  const bytes = new TextEncoder().encode(code) as unknown as BufferSource;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return digest.length === hash.length && digest.every((byte, i) => byte === hash[i]);
}

/** The code from the circle's create transaction, checked against the hash the circle keeps. */
export async function readInviteFromChain(
  connection: Connection,
  pool: PublicKey,
  programId: PublicKey,
  hash: number[]
): Promise<string | null> {
  // The create transaction is the circle's oldest. Keep the last few as candidates, paging
  // back in case a circle has a long history.
  let oldest: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 5; page++) {
    const batch = await connection.getSignaturesForAddress(pool, { before, limit: 1000 }, "confirmed");
    oldest = [...oldest, ...batch.map((s) => s.signature)].slice(-3);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }
  for (const signature of oldest.reverse()) {
    const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    // web3.js 1.x reads returnData but doesn't type it on this response
    const meta = tx?.meta as { returnData?: { programId: string; data: [string, string] } | null } | null | undefined;
    const returned = meta?.returnData;
    if (!returned || returned.programId !== programId.toBase58()) continue;
    const code = atob(returned.data[0]);
    if (await hashMatches(code, hash)) return code;
  }
  return null;
}
