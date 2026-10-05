// Is the program deployed at the app's address the one in this repo?
//   node scripts/check-program.cjs [rpc-url] [pool-address]
// Prints the last deploy slot and upgrade authority, whether the binary has the instructions
// this app calls, and whether a pool decodes with the repo's IDL. Read-only.
const { Connection, PublicKey } = require("@solana/web3.js");
const { BorshAccountsCoder } = require("@coral-xyz/anchor");
const idl = require("../src/lib/solana/idl.json");

const rpc = process.argv[2] || "https://api.devnet.solana.com";
const conn = new Connection(rpc, "confirmed");
const PROGRAM = new PublicKey(idl.address);

(async () => {
  const program = await conn.getAccountInfo(PROGRAM);
  if (!program) throw new Error(`no program at ${PROGRAM.toBase58()} on ${rpc}`);
  const programData = new PublicKey(program.data.subarray(4, 36));
  const data = (await conn.getAccountInfo(programData)).data;
  const slot = Number(data.readBigUInt64LE(4));
  const time = await conn.getBlockTime(slot).catch(() => null);
  console.log(`program ${PROGRAM.toBase58()} on ${rpc}`);
  console.log(`  last deployed: slot ${slot}${time ? ` (${new Date(time * 1000).toISOString()})` : ""}`);
  console.log(`  upgrade authority: ${data[12] === 1 ? new PublicKey(data.subarray(13, 45)).toBase58() : "none"}`);
  console.log(`  program bytes available: ${data.length - 45}`);
  const binary = data.toString("latin1");
  for (const name of ["commit_draw_randomness", "mark_defaulter", "rejoin_pool", "refund_all_stakes", "RandomnessExpired"]) {
    console.log(`  has ${name}: ${binary.includes(name)}`);
  }
  if (process.argv[3]) {
    const pool = await conn.getAccountInfo(new PublicKey(process.argv[3]));
    try {
      const decoded = new BorshAccountsCoder(idl).decode("Pool", pool.data);
      console.log(`  pool decodes with the repo IDL: yes (status ${Object.keys(decoded.status)[0]})`);
    } catch (e) {
      console.log(`  pool decodes with the repo IDL: NO (${pool.data.length} bytes: ${e.message})`);
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
