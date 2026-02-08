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

function deriveDrawPDA(poolPDA, round) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("draw"), poolPDA.toBuffer(), Buffer.from([round])],
    PROGRAM_ID
  );
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n========================================");
  console.log("    FULL E2E TEST WITH 3 MEMBERS");
  console.log("========================================\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const authority = provider.wallet.payer;

  console.log("Authority:", authority.publicKey.toString());

  // Generate 2 more members
  const member2 = Keypair.generate();
  const member3 = Keypair.generate();

  console.log("Member 2:", member2.publicKey.toString());
  console.log("Member 3:", member3.publicKey.toString());

  // Fund members
  console.log("\n--- Funding members ---");
  for (const member of [member2, member3]) {
    try {
      const sig = await provider.connection.requestAirdrop(
        member.publicKey,
        0.1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
      console.log("Airdropped to", member.publicKey.toString().slice(0, 8));
    } catch (e) {
      // Airdrop might fail, try transfer
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

  console.log("\nPool PDA:", poolPDA.toString());
  console.log("Vault PDA:", vaultPDA.toString());

  // ===== TEST 1: CREATE POOL =====
  console.log("\n========================================");
  console.log("TEST 1: CREATE POOL");
  console.log("========================================");

  const createTx = await program.methods
    .createPool("E2E Test Pool", 3, new BN(CONTRIBUTION_AMOUNT), 0, STAKE_MULTIPLIER, true)
    .accounts({
      authority: authority.publicKey,
      creatorStats: creatorStatsPDA,
      pool: poolPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✓ Pool created:", createTx.slice(0, 20) + "...");
  await delay(1000);

  const pool = await program.account.pool.fetch(poolPDA);
  const inviteCode = Buffer.from(pool.inviteCode).toString('utf8');
  console.log("  Invite code:", inviteCode);
  console.log("  stake_enabled:", pool.stakeEnabled);
  console.log("  grace_period:", pool.gracePeriodSeconds.toNumber(), "seconds");

  // ===== TEST 2: JOIN POOL =====
  console.log("\n========================================");
  console.log("TEST 2: JOIN POOL (3 members)");
  console.log("========================================");

  const members = [
    { wallet: authority.publicKey, signer: null, name: "Authority" },
    { wallet: member2.publicKey, signer: member2, name: "Member 2" },
    { wallet: member3.publicKey, signer: member3, name: "Member 3" },
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

  // ===== TEST 3: DEPOSIT STAKES =====
  console.log("\n========================================");
  console.log("TEST 3: DEPOSIT STAKES");
  console.log("========================================");

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

  const vaultBalance = await provider.connection.getBalance(vaultPDA);
  console.log("  Vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

  // ===== TEST 4: START POOL =====
  console.log("\n========================================");
  console.log("TEST 4: START POOL");
  console.log("========================================");

  await program.methods
    .startPool()
    .accounts({
      authority: authority.publicKey,
      pool: poolPDA,
    })
    .rpc();
  console.log("✓ Pool started");
  await delay(500);

  let poolState = await program.account.pool.fetch(poolPDA);
  console.log("  Status:", Object.keys(poolState.status)[0]);
  console.log("  Current round:", poolState.currentRound);

  // ===== TEST 5: ROUND 1 - ALL PAY =====
  console.log("\n========================================");
  console.log("TEST 5: ROUND 1 - ALL MEMBERS PAY");
  console.log("========================================");

  poolState = await program.account.pool.fetch(poolPDA);
  const round1 = poolState.currentRound;

  for (const m of members) {
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

  // ===== TEST 6: EXECUTE DRAW ROUND 1 =====
  console.log("\n========================================");
  console.log("TEST 6: EXECUTE DRAW (ROUND 1)");
  console.log("========================================");

  // Find an eligible winner (someone who hasn't won)
  const [authorityMemberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);
  const [drawPDA1] = deriveDrawPDA(poolPDA, round1);

  const balanceBefore = await provider.connection.getBalance(authority.publicKey);

  await program.methods
    .executeDraw()
    .accounts({
      authority: authority.publicKey,
      pool: poolPDA,
      winnerMember: authorityMemberPDA,
      winnerWallet: authority.publicKey,
      draw: drawPDA1,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const balanceAfter = await provider.connection.getBalance(authority.publicKey);
  const winnings = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;
  console.log("✓ Draw executed for round", round1);
  console.log("  Authority won:", winnings.toFixed(4), "SOL");
  await delay(500);

  poolState = await program.account.pool.fetch(poolPDA);
  console.log("  New current round:", poolState.currentRound);

  // Check authority member state
  const authorityMember = await program.account.member.fetch(authorityMemberPDA);
  console.log("  Authority has_won:", authorityMember.hasWon);
  console.log("  Authority won_round:", authorityMember.wonRound);

  // ===== TEST 7: ROUND 2 - ALL PAY =====
  console.log("\n========================================");
  console.log("TEST 7: ROUND 2 - ALL MEMBERS PAY");
  console.log("========================================");

  poolState = await program.account.pool.fetch(poolPDA);
  const round2 = poolState.currentRound;

  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const [paymentPDA] = derivePaymentPDA(poolPDA, m.wallet, round2);

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
    console.log("✓", m.name, "paid for round", round2);
    await delay(500);
  }

  // ===== TEST 8: EXECUTE DRAW ROUND 2 =====
  console.log("\n========================================");
  console.log("TEST 8: EXECUTE DRAW (ROUND 2)");
  console.log("========================================");

  const [member2PDA] = deriveMemberPDA(poolPDA, member2.publicKey);
  const [drawPDA2] = deriveDrawPDA(poolPDA, round2);

  const balance2Before = await provider.connection.getBalance(member2.publicKey);

  await program.methods
    .executeDraw()
    .accounts({
      authority: authority.publicKey,
      pool: poolPDA,
      winnerMember: member2PDA,
      winnerWallet: member2.publicKey,
      draw: drawPDA2,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const balance2After = await provider.connection.getBalance(member2.publicKey);
  const winnings2 = (balance2After - balance2Before) / LAMPORTS_PER_SOL;
  console.log("✓ Draw executed for round", round2);
  console.log("  Member 2 won:", winnings2.toFixed(4), "SOL");
  await delay(500);

  // ===== TEST 9: ROUND 3 - FINAL ROUND =====
  console.log("\n========================================");
  console.log("TEST 9: ROUND 3 - ALL PAY");
  console.log("========================================");

  poolState = await program.account.pool.fetch(poolPDA);
  const round3 = poolState.currentRound;

  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const [paymentPDA] = derivePaymentPDA(poolPDA, m.wallet, round3);

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
    console.log("✓", m.name, "paid for round", round3);
    await delay(500);
  }

  // ===== TEST 10: EXECUTE FINAL DRAW =====
  console.log("\n========================================");
  console.log("TEST 10: EXECUTE FINAL DRAW (ROUND 3)");
  console.log("========================================");

  const [member3PDA] = deriveMemberPDA(poolPDA, member3.publicKey);
  const [drawPDA3] = deriveDrawPDA(poolPDA, round3);

  const balance3Before = await provider.connection.getBalance(member3.publicKey);

  await program.methods
    .executeDraw()
    .accounts({
      authority: authority.publicKey,
      pool: poolPDA,
      winnerMember: member3PDA,
      winnerWallet: member3.publicKey,
      draw: drawPDA3,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const balance3After = await provider.connection.getBalance(member3.publicKey);
  const winnings3 = (balance3After - balance3Before) / LAMPORTS_PER_SOL;
  console.log("✓ Draw executed for round", round3);
  console.log("  Member 3 won:", winnings3.toFixed(4), "SOL");
  await delay(500);

  // ===== TEST 11: VERIFY FINAL STATE =====
  console.log("\n========================================");
  console.log("TEST 11: VERIFY FINAL STATE");
  console.log("========================================");

  poolState = await program.account.pool.fetch(poolPDA);
  console.log("Pool status:", Object.keys(poolState.status)[0]);
  console.log("Current round:", poolState.currentRound);
  console.log("Total rounds:", poolState.totalRounds);

  // Verify all members have won
  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const memberState = await program.account.member.fetch(memberPDA);
    console.log("\n" + m.name + ":");
    console.log("  has_won:", memberState.hasWon);
    console.log("  won_round:", memberState.wonRound);
    console.log("  stake_deposited:", memberState.stakeDeposited);
    console.log("  in_default:", memberState.inDefault);
    console.log("  is_kicked:", memberState.isKicked);
  }

  // ===== TEST 12: REFUND STAKES =====
  console.log("\n========================================");
  console.log("TEST 12: REFUND STAKES");
  console.log("========================================");

  for (const m of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, m.wallet);
    const memberState = await program.account.member.fetch(memberPDA);

    // Only refund if stake was deposited
    if (memberState.stakeDeposited) {
      const txBuilder = program.methods
        .refundStake()
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
      console.log("✓", m.name, "refunded stake");
      await delay(500);
    }
  }

  const finalVaultBalance = await provider.connection.getBalance(vaultPDA);
  console.log("Final vault balance:", finalVaultBalance / LAMPORTS_PER_SOL, "SOL");

  console.log("\n========================================");
  console.log("    ALL TESTS PASSED!");
  console.log("========================================\n");
}

main().catch(e => {
  console.error("Test failed:", e.message);
  if (e.logs) {
    console.error("Logs:", e.logs);
  }
  process.exit(1);
});
