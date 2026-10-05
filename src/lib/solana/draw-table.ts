import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  type Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

/**
 * Finishing a draw names every seat twice: its member account and this round's payment. From
 * 13 seats that outgrows a legacy transaction, so a big circle's draw keeps the member accounts
 * in an address lookup table instead. The table is made and filled in the same transaction as
 * the commit (one approval), and whoever finishes finds it again from that transaction.
 */
export const TX_LIMIT = 1232;
const PLACEHOLDER_BLOCKHASH = PublicKey.default.toBase58();
const NEVER_DEACTIVATED = BigInt("18446744073709551615");

/** Wire size of these instructions as a legacy transaction with one signature. */
export function legacySize(instructions: TransactionInstruction[], payer: PublicKey): number {
  try {
    const tx = new Transaction({ feePayer: payer, recentBlockhash: PLACEHOLDER_BLOCKHASH }).add(...instructions);
    return tx.serializeMessage().length + 1 + 64;
  } catch {
    return Infinity;
  }
}

/** Wire size of the same instructions as a v0 transaction that uses these tables. */
export function versionedSize(instructions: TransactionInstruction[], payer: PublicKey, tables: AddressLookupTableAccount[]): number {
  try {
    const message = new TransactionMessage({ payerKey: payer, recentBlockhash: PLACEHOLDER_BLOCKHASH, instructions }).compileToV0Message(tables);
    return new VersionedTransaction(message).serialize().length;
  } catch {
    return Infinity;
  }
}

/** A table holding these addresses, to size the finish before the table exists. */
export function plannedTable(authority: PublicKey, addresses: PublicKey[]) {
  return new AddressLookupTableAccount({
    key: PublicKey.default,
    state: { deactivationSlot: NEVER_DEACTIVATED, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority, addresses },
  });
}

/** Create a table and fill it with these addresses (they fit one transaction up to 20 seats). */
export async function drawTableInstructions(connection: Connection, payer: PublicKey, addresses: PublicKey[]) {
  const recentSlot = await connection.getSlot("finalized");
  const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: payer, payer, recentSlot });
  const extend = AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: payer, payer, addresses });
  return { instructions: [create, extend], table };
}

const storageKey = (pool: PublicKey, round: number) => `arisan.drawTable.${pool.toBase58()}.${round}`;
const remembered = new Map<string, string>();

export function rememberDrawTable(pool: PublicKey, round: number, table: PublicKey) {
  remembered.set(storageKey(pool, round), table.toBase58());
  try {
    localStorage.setItem(storageKey(pool, round), table.toBase58());
  } catch {
    // No localStorage (the server, private mode): the in-memory copy and the chain cover it
  }
}

function rememberedTable(pool: PublicKey, round: number): string | null {
  const key = storageKey(pool, round);
  try {
    return remembered.get(key) ?? localStorage.getItem(key);
  } catch {
    return remembered.get(key) ?? null;
  }
}

async function usableTable(connection: Connection, address: PublicKey, addresses: PublicKey[]) {
  const table = (await connection.getAddressLookupTable(address, { commitment: "confirmed" })).value;
  return table && table.isActive() && addresses.every((a) => table.state.addresses.some((b) => b.equals(a))) ? table : null;
}

/** This draw's table: remembered here, or read back from the circle's latest transactions. */
export async function findDrawTable(
  connection: Connection,
  pool: PublicKey,
  round: number,
  addresses: PublicKey[]
): Promise<AddressLookupTableAccount | null> {
  const saved = rememberedTable(pool, round);
  if (saved) {
    const table = await usableTable(connection, new PublicKey(saved), addresses);
    if (table) return table;
  }
  const recent = await connection.getSignaturesForAddress(pool, { limit: 10 }, "confirmed");
  for (const { signature, err } of recent) {
    if (err) continue;
    const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const message = tx?.transaction.message;
    if (!message) continue;
    const keys = message.staticAccountKeys;
    for (const ix of message.compiledInstructions) {
      if (!keys[ix.programIdIndex]?.equals(AddressLookupTableProgram.programId)) continue;
      const table = await usableTable(connection, keys[ix.accountKeyIndexes[0]], addresses);
      if (table) return table;
    }
  }
  return null;
}
