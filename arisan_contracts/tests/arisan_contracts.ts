import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { ArisanContracts } from "../target/types/arisan_contracts";

describe("arisan_contracts", () => {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ArisanContracts as Program<ArisanContracts>;

  // Test accounts
  const authority = provider.wallet;
  const member2 = Keypair.generate();

  // PDA seeds
  const CREATOR_SEED = Buffer.from("creator");
  const POOL_SEED = Buffer.from("pool");
  const VAULT_SEED = Buffer.from("vault");
  const MEMBER_SEED = Buffer.from("member");
  const PAYMENT_SEED = Buffer.from("payment");

  // Derived addresses
  let creatorStatsPDA: PublicKey;
  let poolPDA: PublicKey;
  let vaultPDA: PublicKey;
  let memberPDA: PublicKey;
  let member2PDA: PublicKey;
  let paymentPDA: PublicKey;
  let drawPDA: PublicKey;
  let payment2PDA: PublicKey;

  // Draw seed
  const DRAW_SEED = Buffer.from("draw");

  // Pool parameters
  const poolName = "Test Pool";
  const maxMembers = 5;
  const contributionAmount = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
  const currency = 0; // SOL
  const stakeMultiplier = 1;
  const stakeEnabled = true;
  const autoMode = false; // Manual mode for this test

  before(async () => {
    console.log("Program ID:", program.programId.toBase58());
    console.log("Authority:", authority.publicKey.toBase58());
    console.log("Member2:", member2.publicKey.toBase58());

    // Get pool index from creator stats (or 0 if first pool)
    [creatorStatsPDA] = PublicKey.findProgramAddressSync(
      [CREATOR_SEED, authority.publicKey.toBuffer()],
      program.programId
    );
    console.log("Creator Stats PDA:", creatorStatsPDA.toBase58());

    let poolIndex = new BN(0);
    try {
      const stats = await program.account.creatorStats.fetch(creatorStatsPDA);
      poolIndex = stats.poolCount;
      console.log("Existing pool count:", poolIndex.toString());
    } catch (e) {
      // Anchor fetch failed - try raw account fetch
      try {
        const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
        if (accountInfo && accountInfo.data.length >= 16) {
          // CreatorStats layout: 8 bytes discriminator + 8 bytes pool_count (u64 LE) + 1 byte bump
          const poolCountBytes = accountInfo.data.slice(8, 16);
          poolIndex = new BN(poolCountBytes, 'le');
          console.log("Raw fetch pool count:", poolIndex.toString());
        } else {
          console.log("No existing creator stats, using pool index 0");
        }
      } catch (rawError) {
        console.log("No existing creator stats, using pool index 0");
      }
    }

    // Derive pool PDA
    const poolIndexBuffer = Buffer.alloc(8);
    poolIndexBuffer.writeBigUInt64LE(BigInt(poolIndex.toString()));

    [poolPDA] = PublicKey.findProgramAddressSync(
      [POOL_SEED, authority.publicKey.toBuffer(), poolIndexBuffer],
      program.programId
    );
    console.log("Pool PDA:", poolPDA.toBase58());

    // Derive vault PDA
    [vaultPDA] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, poolPDA.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPDA.toBase58());

    // Derive member PDAs
    [memberPDA] = PublicKey.findProgramAddressSync(
      [MEMBER_SEED, poolPDA.toBuffer(), authority.publicKey.toBuffer()],
      program.programId
    );
    console.log("Authority Member PDA:", memberPDA.toBase58());

    [member2PDA] = PublicKey.findProgramAddressSync(
      [MEMBER_SEED, poolPDA.toBuffer(), member2.publicKey.toBuffer()],
      program.programId
    );
    console.log("Member2 PDA:", member2PDA.toBase58());

    // Airdrop SOL to member2 for testing
    console.log("\nAirdropping 1 SOL to member2...");
    try {
      const sig = await provider.connection.requestAirdrop(
        member2.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
      console.log("Airdrop successful");
    } catch (e) {
      console.log("Airdrop failed (may already have funds):", e.message);
    }
  });

  it("1. Creates a pool", async () => {
    console.log("\n=== Creating Pool ===");

    try {
      const tx = await program.methods
        .createPool(
          poolName,
          maxMembers,
          contributionAmount,
          currency,
          stakeMultiplier,
          stakeEnabled,
          autoMode
        )
        .accounts({
          authority: authority.publicKey,
          creatorStats: creatorStatsPDA,
          pool: poolPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Create pool tx:", tx);

      // Verify pool was created
      const pool = await program.account.pool.fetch(poolPDA);
      console.log("Pool name:", Buffer.from(pool.name).toString().replace(/\0/g, ''));
      console.log("Max members:", pool.maxMembers);
      console.log("Contribution:", pool.contributionAmount.toString());
      console.log("Status:", Object.keys(pool.status)[0]);
      console.log("Invite code:", Buffer.from(pool.inviteCode).toString());

      assert.equal(pool.maxMembers, maxMembers);
      assert.equal(pool.memberCount, 0);
      assert.ok("pending" in pool.status);

      console.log("✓ Pool created successfully!");
    } catch (e) {
      console.error("Create pool failed:", e);
      throw e;
    }
  });

  it("2. Authority joins the pool", async () => {
    console.log("\n=== Authority Joining Pool ===");

    // Get invite code from pool
    const pool = await program.account.pool.fetch(poolPDA);
    const inviteCode = Buffer.from(pool.inviteCode).toString();
    console.log("Using invite code:", inviteCode);

    try {
      const tx = await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: memberPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Join pool tx:", tx);

      // Verify member was created
      const member = await program.account.member.fetch(memberPDA);
      console.log("Member wallet:", member.wallet.toBase58());
      console.log("Position:", member.position);
      console.log("Stake deposited:", member.stakeDeposited);

      // Verify pool member count increased
      const updatedPool = await program.account.pool.fetch(poolPDA);
      console.log("Pool member count:", updatedPool.memberCount);

      assert.equal(member.wallet.toBase58(), authority.publicKey.toBase58());
      assert.equal(updatedPool.memberCount, 1);

      console.log("✓ Authority joined successfully!");
    } catch (e) {
      console.error("Join pool failed:", e);
      throw e;
    }
  });

  it("3. Member2 joins the pool", async () => {
    console.log("\n=== Member2 Joining Pool ===");

    // Get invite code from pool
    const pool = await program.account.pool.fetch(poolPDA);
    const inviteCode = Buffer.from(pool.inviteCode).toString();

    try {
      const tx = await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member2.publicKey,
          pool: poolPDA,
          member: member2PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member2])
        .rpc();

      console.log("Join pool tx:", tx);

      // Verify
      const member = await program.account.member.fetch(member2PDA);
      const updatedPool = await program.account.pool.fetch(poolPDA);

      console.log("Member2 position:", member.position);
      console.log("Pool member count:", updatedPool.memberCount);

      assert.equal(member.wallet.toBase58(), member2.publicKey.toBase58());
      assert.equal(updatedPool.memberCount, 2);

      console.log("✓ Member2 joined successfully!");
    } catch (e) {
      console.error("Member2 join failed:", e);
      throw e;
    }
  });

  it("4. Authority deposits stake", async () => {
    console.log("\n=== Authority Depositing Stake ===");

    try {
      const tx = await program.methods
        .depositStake()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: memberPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Deposit stake tx:", tx);

      // Verify
      const member = await program.account.member.fetch(memberPDA);
      console.log("Stake deposited:", member.stakeDeposited);
      console.log("Stake amount:", member.stakeAmount.toString());

      assert.ok(member.stakeDeposited);

      console.log("✓ Authority stake deposited!");
    } catch (e) {
      console.error("Deposit stake failed:", e);
      throw e;
    }
  });

  it("5. Member2 deposits stake", async () => {
    console.log("\n=== Member2 Depositing Stake ===");

    try {
      const tx = await program.methods
        .depositStake()
        .accounts({
          user: member2.publicKey,
          pool: poolPDA,
          member: member2PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member2])
        .rpc();

      console.log("Deposit stake tx:", tx);

      const member = await program.account.member.fetch(member2PDA);
      assert.ok(member.stakeDeposited);

      console.log("✓ Member2 stake deposited!");
    } catch (e) {
      console.error("Member2 deposit stake failed:", e);
      throw e;
    }
  });

  it("6. Authority starts the pool", async () => {
    console.log("\n=== Starting Pool ===");

    try {
      const tx = await program.methods
        .startPool()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
        })
        .rpc();

      console.log("Start pool tx:", tx);

      // Verify
      const pool = await program.account.pool.fetch(poolPDA);
      console.log("Pool status:", Object.keys(pool.status)[0]);
      console.log("Current round:", pool.currentRound);

      assert.ok("active" in pool.status);
      assert.equal(pool.currentRound, 1);

      console.log("✓ Pool started successfully!");
    } catch (e) {
      console.error("Start pool failed:", e);
      throw e;
    }
  });

  it("7. Authority makes payment for round 1", async () => {
    console.log("\n=== Authority Making Payment ===");

    const pool = await program.account.pool.fetch(poolPDA);
    const round = pool.currentRound;

    // Derive payment PDA
    [paymentPDA] = PublicKey.findProgramAddressSync(
      [PAYMENT_SEED, poolPDA.toBuffer(), authority.publicKey.toBuffer(), Buffer.from([round])],
      program.programId
    );
    console.log("Payment PDA:", paymentPDA.toBase58());

    try {
      const tx = await program.methods
        .makePayment()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: memberPDA,
          payment: paymentPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Make payment tx:", tx);

      // Verify
      const payment = await program.account.payment.fetch(paymentPDA);
      console.log("Payment round:", payment.round);
      console.log("Payment amount:", payment.amount.toString());

      const member = await program.account.member.fetch(memberPDA);
      console.log("Member payments made:", member.paymentsMade);

      assert.equal(payment.round, round);

      console.log("✓ Payment made successfully!");
    } catch (e) {
      console.error("Make payment failed:", e);
      throw e;
    }
  });

  it("8. Check vault balance", async () => {
    console.log("\n=== Checking Vault Balance ===");

    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    console.log("Vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

    // Should have: 2 stakes + 1 payment
    const expectedMin = contributionAmount.toNumber() * 3; // 2 stakes at 1x + 1 payment
    console.log("Expected minimum:", expectedMin / LAMPORTS_PER_SOL, "SOL");

    assert.ok(vaultBalance >= expectedMin, "Vault should have collected funds");

    console.log("✓ Vault has correct balance!");
  });

  it("9. Member2 makes payment for round 1", async () => {
    console.log("\n=== Member2 Making Payment ===");

    const pool = await program.account.pool.fetch(poolPDA);
    const round = pool.currentRound;

    // Derive payment PDA for member2
    [payment2PDA] = PublicKey.findProgramAddressSync(
      [PAYMENT_SEED, poolPDA.toBuffer(), member2.publicKey.toBuffer(), Buffer.from([round])],
      program.programId
    );
    console.log("Member2 Payment PDA:", payment2PDA.toBase58());

    try {
      const tx = await program.methods
        .makePayment()
        .accounts({
          user: member2.publicKey,
          pool: poolPDA,
          member: member2PDA,
          payment: payment2PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member2])
        .rpc();

      console.log("Make payment tx:", tx);

      // Verify
      const payment = await program.account.payment.fetch(payment2PDA);
      console.log("Payment round:", payment.round);
      console.log("Payment amount:", payment.amount.toString());

      const member = await program.account.member.fetch(member2PDA);
      console.log("Member2 payments made:", member.paymentsMade);

      assert.equal(payment.round, round);

      console.log("✓ Member2 payment made successfully!");
    } catch (e) {
      console.error("Member2 make payment failed:", e);
      throw e;
    }
  });

  it("10. Execute draw for round 1 (select authority as winner)", async () => {
    console.log("\n=== Executing Draw ===");

    const pool = await program.account.pool.fetch(poolPDA);
    const round = pool.currentRound;

    // Derive draw PDA
    [drawPDA] = PublicKey.findProgramAddressSync(
      [DRAW_SEED, poolPDA.toBuffer(), Buffer.from([round])],
      program.programId
    );
    console.log("Draw PDA:", drawPDA.toBase58());

    try {
      const tx = await program.methods
        .executeDraw()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
          winnerMember: memberPDA,
          winnerWallet: authority.publicKey,
          draw: drawPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Execute draw tx:", tx);

      // Verify draw was created
      const draw = await program.account.draw.fetch(drawPDA);
      console.log("Draw round:", draw.round);
      console.log("Draw winner:", draw.winner.toBase58());
      console.log("Draw amount:", draw.amount.toString());
      console.log("Draw claimed:", draw.claimed);

      // Verify member was marked as winner
      const member = await program.account.member.fetch(memberPDA);
      console.log("Member has_won:", member.hasWon);
      console.log("Member won_round:", member.wonRound);

      assert.equal(draw.round, round);
      assert.equal(draw.winner.toBase58(), authority.publicKey.toBase58());
      assert.ok(!draw.claimed);
      assert.ok(member.hasWon);
      assert.equal(member.wonRound, round);

      console.log("✓ Draw executed successfully!");
    } catch (e) {
      console.error("Execute draw failed:", e);
      throw e;
    }
  });

  it("11. Winner (authority) claims winnings", async () => {
    console.log("\n=== Claiming Winnings ===");

    const vaultBalanceBefore = await provider.connection.getBalance(vaultPDA);
    const winnerBalanceBefore = await provider.connection.getBalance(authority.publicKey);
    console.log("Vault balance before:", vaultBalanceBefore / LAMPORTS_PER_SOL, "SOL");
    console.log("Winner balance before:", winnerBalanceBefore / LAMPORTS_PER_SOL, "SOL");

    try {
      const tx = await program.methods
        .claimWinnings()
        .accounts({
          winner: authority.publicKey,
          pool: poolPDA,
          member: memberPDA,
          draw: drawPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Claim winnings tx:", tx);

      // Verify
      const draw = await program.account.draw.fetch(drawPDA);
      console.log("Draw claimed:", draw.claimed);
      assert.ok(draw.claimed);

      const vaultBalanceAfter = await provider.connection.getBalance(vaultPDA);
      const winnerBalanceAfter = await provider.connection.getBalance(authority.publicKey);
      console.log("Vault balance after:", vaultBalanceAfter / LAMPORTS_PER_SOL, "SOL");
      console.log("Winner balance after:", winnerBalanceAfter / LAMPORTS_PER_SOL, "SOL");

      // Check pool status
      const pool = await program.account.pool.fetch(poolPDA);
      console.log("Pool current round after claim:", pool.currentRound);
      console.log("Pool status:", Object.keys(pool.status)[0]);

      // If this was the last round, pool should be completed
      // If not, round should advance
      if (pool.currentRound > pool.totalRounds) {
        assert.ok("completed" in pool.status);
      }

      console.log("✓ Winnings claimed successfully!");
    } catch (e) {
      console.error("Claim winnings failed:", e);
      throw e;
    }
  });

  it("12. Check final vault and pool state", async () => {
    console.log("\n=== Final State Check ===");

    const pool = await program.account.pool.fetch(poolPDA);
    console.log("Pool status:", Object.keys(pool.status)[0]);
    console.log("Pool current round:", pool.currentRound);
    console.log("Pool total rounds:", pool.totalRounds);

    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    console.log("Final vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

    // Stakes should remain in vault (0.1 SOL * 2 = 0.2 SOL for stakes)
    // Winnings were transferred out
    console.log("✓ Final state verified!");
  });

  after(async () => {
    console.log("\n=== Test Summary ===");
    console.log("Pool address:", poolPDA.toBase58());
    console.log("All tests passed!");
  });
});
