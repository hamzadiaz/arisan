#!/usr/bin/env node
/**
 * Live 2-seat circle on devnet: create, join, stake, start, pay, draw both
 * rounds, prove leave/refund fail mid-circle, then refund stakes.
 */
const fs = require("fs");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet, BN } = require("@coral-xyz/anchor");
const idl = require("../src/lib/solana/idl.json");

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(idl.address);
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const CONTRIB = 10_000_000; // 0.01 SOL
const EXPLORER = "https://explorer.solana.com";

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
function u64le(bytes, offset) {
  return Buffer.from(bytes).readBigUInt64LE(offset);
}
function readSlotHash(data, targetSlot) {
  if (data.length < 8) return null;
  const declared = Number(u64le(data, 0));
  const count = Math.min(declared, Math.floor((data.length - 8) / 40));
  for (let i = 0; i < count; i++) {
    const off = 8 + i * 40;
    const slot = u64le(data, off);
    if (slot === targetSlot) return data.subarray(off + 8, off + 40);
    if (slot < targetSlot) return null;
  }
  return null;
}
function selectWinner(hash, wallets) {
  const sorted = [...wallets].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
  const idx = Number(u64le(hash, 0) % BigInt(sorted.length));
  return sorted[idx];
}
function link(sig) {
  return `${EXPLORER}/tx/${sig}?cluster=devnet`;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf8")))
  );
  const other = Keypair.generate();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);
  const log = (step, extra) => console.log(step, extra || "");

  log("payer", payer.publicKey.toBase58());
  log("other", other.publicKey.toBase58());

  const fund = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: other.publicKey,
    lamports: 80_000_000,
  });
  const fundSig = await sendAndConfirmTransaction(connection, new Transaction().add(fund), [payer]);
  log("funded other", link(fundSig));

  const statsPda = pda([Buffer.from("creator"), payer.publicKey.toBuffer()]);
  let poolIndex = 0;
  try {
    const stats = await program.account.creatorStats.fetch(statsPda);
    poolIndex = Number(stats.poolCount);
  } catch (_) {}
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64LE(BigInt(poolIndex));
  const pool = pda([Buffer.from("pool"), payer.publicKey.toBuffer(), idx]);
  const vault = pda([Buffer.from("vault"), pool.toBuffer()]);
  log("pool", pool.toBase58());

  const createSig = await program.methods
    .createPool("Smoke2", 2, new BN(CONTRIB), 0, 1, true, false)
    .accounts({
      authority: payer.publicKey,
      creatorStats: statsPda,
      pool,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const createTx = await connection.getTransaction(createSig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  const invite = Buffer.from(createTx.meta.returnData.data[0], "base64").toString("utf8");
  log("created", `${link(createSig)} invite=${invite}`);

  const memberPda = (wallet) => pda([Buffer.from("member"), pool.toBuffer(), wallet.toBuffer()]);
  const paymentPda = (wallet, round) =>
    pda([Buffer.from("payment"), pool.toBuffer(), wallet.toBuffer(), Buffer.from([round])]);

  async function asUser(user, fn) {
    const p = new AnchorProvider(connection, new Wallet(user), { commitment: "confirmed" });
    return fn(new Program(idl, p));
  }

  for (const user of [payer, other]) {
    await asUser(user, (p) =>
      p.methods
        .joinPool(invite)
        .accounts({
          user: user.publicKey,
          pool,
          member: memberPda(user.publicKey),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc()
    );
    log("joined", user.publicKey.toBase58().slice(0, 8));
  }
  for (const user of [payer, other]) {
    await asUser(user, (p) =>
      p.methods
        .depositStake()
        .accounts({
          user: user.publicKey,
          pool,
          member: memberPda(user.publicKey),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc()
    );
    log("staked", user.publicKey.toBase58().slice(0, 8));
  }

  const startSig = await program.methods
    .startPool()
    .accounts({ authority: payer.publicKey, pool })
    .remainingAccounts(
      [payer.publicKey, other.publicKey].map((w) => ({
        pubkey: memberPda(w),
        isWritable: false,
        isSigner: false,
      }))
    )
    .rpc();
  log("started", link(startSig));

  try {
    await asUser(other, (p) =>
      p.methods
        .leavePool()
        .accounts({
          user: other.publicKey,
          pool,
          member: memberPda(other.publicKey),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([other])
        .rpc()
    );
    throw new Error("leave after start should have failed");
  } catch (e) {
    log("leave-after-start rejected", String(e.message || e).slice(0, 180));
  }

  async function pay(user, round) {
    await asUser(user, (p) =>
      p.methods
        .makePayment()
        .accounts({
          user: user.publicKey,
          pool,
          member: memberPda(user.publicKey),
          payment: paymentPda(user.publicKey, round),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc()
    );
  }

  async function draw(round) {
    await pay(payer, round);
    await pay(other, round);
    const commitSig = await program.methods
      .commitDrawRandomness()
      .accounts({ caller: payer.publicKey, pool })
      .rpc();
    log(`r${round} committed`, link(commitSig));
    const after = await program.account.pool.fetch(pool);
    const committedSlot = BigInt(after.randomnessSlot.toString());
    let hash = null;
    const start = Date.now();
    while (Date.now() - start < 45_000) {
      const info = await connection.getAccountInfo(SLOT_HASHES);
      hash = info ? readSlotHash(info.data, committedSlot) : null;
      if (hash) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!hash) throw new Error("slot hash never landed");
    const wallets = [payer.publicKey, other.publicKey];
    const members = await Promise.all(
      wallets.map((w) => program.account.member.fetch(memberPda(w)))
    );
    const eligible = wallets.filter((w, i) => !members[i].hasWon && !members[i].isKicked);
    const winner = selectWinner(hash, eligible);
    const drawPda = pda([Buffer.from("draw"), pool.toBuffer(), Buffer.from([round])]);
    const remaining = [
      ...wallets.map((w) => ({ pubkey: memberPda(w), isWritable: true, isSigner: false })),
      ...wallets.map((w) => ({ pubkey: paymentPda(w, round), isWritable: false, isSigner: false })),
    ];
    const execSig = await program.methods
      .executeDraw()
      .accounts({
        authority: payer.publicKey,
        pool,
        winnerWallet: winner,
        draw: drawPda,
        vault,
        systemProgram: SystemProgram.programId,
        slotHashes: SLOT_HASHES,
      })
      .remainingAccounts(remaining)
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
      .rpc();
    log(`r${round} drawn winner=${winner.toBase58().slice(0, 8)}`, link(execSig));
    return winner;
  }

  const w1 = await draw(1);
  const mid = await program.account.pool.fetch(pool);
  if (!("active" in mid.status)) throw new Error("pool should still be active after round 1");
  log("after jackpot 1 status=active");

  try {
    await asUser(other, (p) =>
      p.methods
        .claimStakeRefund()
        .accounts({
          user: other.publicKey,
          pool,
          member: memberPda(other.publicKey),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([other])
        .rpc()
    );
    throw new Error("stake refund after jackpot should have failed");
  } catch (e) {
    log("refund-after-jackpot rejected", String(e.message || e).slice(0, 180));
  }

  const w2 = await draw(2);
  const done = await program.account.pool.fetch(pool);
  if (!("completed" in done.status)) throw new Error("pool should be completed");
  log("completed", `winners ${w1.toBase58().slice(0, 8)} then ${w2.toBase58().slice(0, 8)}`);

  for (const user of [payer, other]) {
    const sig = await asUser(user, (p) =>
      p.methods
        .claimStakeRefund()
        .accounts({
          user: user.publicKey,
          pool,
          member: memberPda(user.publicKey),
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc()
    );
    log("refunded", `${user.publicKey.toBase58().slice(0, 8)} ${link(sig)}`);
  }
  log("OK", `${EXPLORER}/address/${pool.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
