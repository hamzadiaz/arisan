const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const path = require('path');
const fs = require('fs');
const BN = require("bn.js");

const idlPath = path.join(__dirname, '../target/idl/arisan_contracts.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

const CONTRIBUTION_AMOUNT = 0.005 * LAMPORTS_PER_SOL;
const STAKE_MULTIPLIER = 1;

function deriveCreatorStatsPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), authority.toBuffer()],
    PROGRAM_ID
  );
}

function derivePoolPDA(authority, poolCount) {
  const poolCountBuf = poolCount.toArrayLike(Buffer, 'le', 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), authority.toBuffer(), poolCountBuf],
    PROGRAM_ID
  );
}

function deriveVaultPDA(poolPDA) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()],
    PROGRAM_ID
  );
}

function deriveMemberPDA(poolPDA, userWallet) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), poolPDA.toBuffer(), userWallet.toBuffer()],
    PROGRAM_ID
  );
}

function derivePaymentPDA(poolPDA, userWallet, round) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), poolPDA.toBuffer(), userWallet.toBuffer(), Buffer.from([round])],
    PROGRAM_ID
  );
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n========================================");
  console.log("    EDGE CASES TEST - DEFAULTER FLOW");
  console.log("========================================\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const authority = provider.wallet.payer;

  console.log("Authority:", authority.publicKey.toString());

  // Generate 2 more members
  const member2 = Keypair.generate();
  const defaulter = Keypair.generate(); // This member will default

  console.log("Member 2:", member2.publicKey.toString());
  console.log("Defaulter:", defaulter.publicKey.toString());

  // Fund members
  console.log("\n--- Funding members ---");
  for (const member of [member2, defaulter]) {
    try {
      const tx = await provider.connection.sendTransaction(
        new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: member.publicKey,
            lamports: 0.1 * LAMPORTS_PER_SOL,
          })
        ),
        [authority]
      );
      await provider.connection.confirmTransaction(tx);
      console.log("Funded", member.publicKey.toString().slice(0, 8));
    } catch (e) {
      console.log("Error funding:", e.message);
    }
    await delay(500);
  }

  // Get creator stats
  const [creatorStatsPDA] = deriveCreatorStatsPDA(authority.publicKey);
  let poolCount = new BN(0);
  try {
    const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
    if (accountInfo && accountInfo.data.length >= 16) {
      const poolCountBytes = accountInfo.data.slice(8, 16);
      poolCount = new BN(poolCountBytes, 'le');
    }
  } catch (e) {}

  const [poolPDA] = derivePoolPDA(authority.publicKey, poolCount);
  const [vaultPDA] = deriveVaultPDA(poolPDA);

  // ===== CREATE POOL =====
  console.log("\n========================================");
  console.log("SETUP: CREATE POOL & JOIN");
  console.log("========================================");

  await program.methods
    .createPool("Defaulter Test", 3, new BN(CONTRIBUTION_AMOUNT), 0, STAKE_MULTIPLIER, true)
    .accounts({
      authority: authority.publicKey,
      creatorStats: creatorStatsPDA,
      pool: poolPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✓ Pool created");
  await delay(1000);

  const pool = await program.account.pool.fetch(poolPDA);
  const inviteCode = Buffer.from(pool.inviteCode).toString('utf8');

  // Join pool
  const members = [
    { wallet: authority.publicKey, signer: null, name: "Authority" },
    { wallet: member2.publicKey, signer: member2, name: "Member 2" },
    { wallet: defaulter.publicKey, signer: defaulter, name: "Defaulter" },
  ];

  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const txBuilder = program.methods
      .joinPool(inviteCode)
      .accounts({
        user: m.wallet,
        pool: poolPDA,
        member: memberPDA,
        systemProgram: SystemProgram.programId,
      });
    if (m.signer) {
      await txBuilder.signers([m.signer]).rpc();
    } else {
      await txBuilder.rpc();
    }
    console.log("✓", m.name, "joined");
    await delay(500);
  }

  // Deposit stakes
  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const txBuilder = program.methods
      .depositStake()
      .accounts({
        user: m.wallet,
        pool: poolPDA,
        member: memberPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      });
    if (m.signer) {
      await txBuilder.signers([m.signer]).rpc();
    } else {
      await txBuilder.rpc();
    }
    console.log("✓", m.name, "deposited stake");
    await delay(500);
  }

  // Start pool
  await program.methods
    .startPool()
    .accounts({
      authority: authority.publicKey,
      pool: poolPDA,
    })
    .rpc();
  console.log("✓ Pool started");
  await delay(500);

  // ===== TEST: MARK DEFAULTER =====
  console.log("\n========================================");
  console.log("TEST: MARK DEFAULTER (before payment)");
  console.log("========================================");

  const [defaulterMemberPDA] = deriveMemberPDA(poolPDA, defaulter.publicKey);

  // Check defaulter state before
  let defaulterState = await program.account.member.fetch(defaulterMemberPDA);
  console.log("\nDefaulter state BEFORE:");
  console.log("  in_default:", defaulterState.inDefault);
  console.log("  in_grace_period:", defaulterState.inGracePeriod);
  console.log("  is_kicked:", defaulterState.isKicked);
  console.log("  missed_rounds:", defaulterState.missedRounds);

  // Try to mark as defaulter (has_paid=false means they didn't pay)
  try {
    await program.methods
      .markDefaulter(false) // has_paid = false
      .accounts({
        caller: authority.publicKey,
        pool: poolPDA,
        member: defaulterMemberPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Marked as defaulter");
    await delay(500);

    // Check state after
    defaulterState = await program.account.member.fetch(defaulterMemberPDA);
    console.log("\nDefaulter state AFTER mark_defaulter:");
    console.log("  in_default:", defaulterState.inDefault);
    console.log("  in_grace_period:", defaulterState.inGracePeriod);
    console.log("  grace_deadline:", defaulterState.graceDeadline.toNumber());
    console.log("  is_kicked:", defaulterState.isKicked);
    console.log("  missed_rounds:", defaulterState.missedRounds);

  } catch (e) {
    console.log("✗ mark_defaulter failed:", e.message);
    // This is expected if the member has already paid or other conditions aren't met
    // Log the full error for debugging
    if (e.logs) {
      console.log("Logs:", e.logs.slice(-5));
    }
  }

  // ===== ROUND 1: Paying members pay, defaulter doesn't =====
  console.log("\n========================================");
  console.log("ROUND 1: Authority & Member 2 pay");
  console.log("========================================");

  const poolState = await program.account.pool.fetch(poolPDA);
  const round1 = poolState.currentRound;

  // Only authority and member2 pay
  for (const m of [members[0], members[1]]) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const [paymentPDA] = derivePaymentPDA(poolPDA, m.wallet, round1);

    const txBuilder = program.methods
      .makePayment()
      .accounts({
        user: m.wallet,
        pool: poolPDA,
        member: memberPDA,
        payment: paymentPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      });

    if (m.signer) {
      await txBuilder.signers([m.signer]).rpc();
    } else {
      await txBuilder.rpc();
    }
    console.log("✓", m.name, "paid for round", round1);
    await delay(500);
  }

  console.log("✗ Defaulter did NOT pay for round", round1);

  // ===== TEST: TRY MARK DEFAULTER AGAIN =====
  console.log("\n========================================");
  console.log("TEST: MARK DEFAULTER (after missed payment)");
  console.log("========================================");

  try {
    await program.methods
      .markDefaulter(false) // has_paid = false
      .accounts({
        caller: authority.publicKey,
        pool: poolPDA,
        member: defaulterMemberPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Marked as defaulter");
    await delay(500);

    defaulterState = await program.account.member.fetch(defaulterMemberPDA);
    console.log("\nDefaulter state AFTER second mark_defaulter:");
    console.log("  in_default:", defaulterState.inDefault);
    console.log("  in_grace_period:", defaulterState.inGracePeriod);
    console.log("  grace_deadline:", defaulterState.graceDeadline.toNumber());
    console.log("  is_kicked:", defaulterState.isKicked);
    console.log("  missed_rounds:", defaulterState.missedRounds);

  } catch (e) {
    console.log("✗ mark_defaulter failed:", e.message);
    if (e.logs) {
      const errorLogs = e.logs.filter(l => l.includes("Error") || l.includes("failed"));
      console.log("Error logs:", errorLogs);
    }
  }

  // ===== TEST: REJOIN POOL =====
  console.log("\n========================================");
  console.log("TEST: REJOIN POOL (if kicked)");
  console.log("========================================");

  defaulterState = await program.account.member.fetch(defaulterMemberPDA);
  if (defaulterState.isKicked) {
    console.log("Defaulter is kicked, attempting rejoin...");
    try {
      await program.methods
        .rejoinPool()
        .accounts({
          user: defaulter.publicKey,
          pool: poolPDA,
          member: defaulterMemberPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([defaulter])
        .rpc();
      console.log("✓ Rejoined pool successfully");

      defaulterState = await program.account.member.fetch(defaulterMemberPDA);
      console.log("\nDefaulter state AFTER rejoin:");
      console.log("  in_default:", defaulterState.inDefault);
      console.log("  in_grace_period:", defaulterState.inGracePeriod);
      console.log("  is_kicked:", defaulterState.isKicked);
    } catch (e) {
      console.log("✗ rejoin_pool failed:", e.message);
    }
  } else {
    console.log("Defaulter is not kicked yet, skipping rejoin test");
  }

  // ===== FINAL STATE =====
  console.log("\n========================================");
  console.log("FINAL STATE SUMMARY");
  console.log("========================================");

  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const memberState = await program.account.member.fetch(memberPDA);
    console.log("\n" + m.name + ":");
    console.log("  payments_made:", memberState.paymentsMade);
    console.log("  in_default:", memberState.inDefault);
    console.log("  in_grace_period:", memberState.inGracePeriod);
    console.log("  is_kicked:", memberState.isKicked);
    console.log("  missed_rounds:", memberState.missedRounds);
  }

  console.log("\n========================================");
  console.log("    EDGE CASE TESTS COMPLETE!");
  console.log("========================================\n");
}

main().catch(e => {
  console.error("Test failed:", e.message);
  if (e.logs) {
    console.error("Logs:", e.logs.slice(-10));
  }
  process.exit(1);
});
