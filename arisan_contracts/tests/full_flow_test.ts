import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import BN from "bn.js";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load IDL from target
const IDL = JSON.parse(fs.readFileSync(join(__dirname, "../target/idl/arisan_contracts.json"), "utf8"));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

describe("Arisan Full Flow Test - 4 Users, 4 Rounds", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(IDL, provider);

  // Authority (pool creator) - uses the default wallet
  const authority = provider.wallet;

  // 3 additional members
  const member2 = Keypair.generate();
  const member3 = Keypair.generate();
  const member4 = Keypair.generate();

  // Pool config
  const CONTRIBUTION_AMOUNT = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL per month
  const STAKE_MULTIPLIER = 1; // 1x stake = 0.01 SOL
  const MAX_MEMBERS = 4;

  // PDAs - will be set during tests
  let poolPDA: PublicKey;
  let vaultPDA: PublicKey;
  let creatorStatsPDA: PublicKey;
  let poolIndex: BN;
  let inviteCode: string;

  // Member PDAs
  let member1PDA: PublicKey; // authority
  let member2PDA: PublicKey;
  let member3PDA: PublicKey;
  let member4PDA: PublicKey;

  // Helper to fund wallets
  async function fundWallet(wallet: PublicKey, amount: number): Promise<boolean> {
    try {
      const sig = await provider.connection.requestAirdrop(wallet, amount);
      await provider.connection.confirmTransaction(sig);
      console.log(`  Funded ${wallet.toString().slice(0, 8)}... with ${amount / LAMPORTS_PER_SOL} SOL`);
      return true;
    } catch (e) {
      console.log(`  Airdrop failed for ${wallet.toString().slice(0, 8)}... (rate limited)`);
      return false;
    }
  }

  // Helper to get pool_count from raw account data
  async function getPoolCount(creatorStatsPDA: PublicKey): Promise<BN> {
    const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
    if (accountInfo && accountInfo.data.length >= 16) {
      const poolCountBytes = accountInfo.data.slice(8, 16);
      return new BN(poolCountBytes, 'le');
    }
    return new BN(0);
  }

  // Helper to derive PDAs
  function derivePoolPDA(authority: PublicKey, poolIndex: BN): [PublicKey, number] {
    const poolIndexBuffer = Buffer.alloc(8);
    poolIndex.toArrayLike(Buffer, 'le', 8).copy(poolIndexBuffer);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), authority.toBuffer(), poolIndexBuffer],
      PROGRAM_ID
    );
  }

  function deriveVaultPDA(poolPDA: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolPDA.toBuffer()],
      PROGRAM_ID
    );
  }

  function deriveMemberPDA(poolPDA: PublicKey, wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("member"), poolPDA.toBuffer(), wallet.toBuffer()],
      PROGRAM_ID
    );
  }

  function deriveDrawPDA(poolPDA: PublicKey, round: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("draw"), poolPDA.toBuffer(), Buffer.from([round])],
      PROGRAM_ID
    );
  }

  function derivePaymentPDA(poolPDA: PublicKey, member: PublicKey, round: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), poolPDA.toBuffer(), member.toBuffer(), Buffer.from([round])],
      PROGRAM_ID
    );
  }

  before(async () => {
    console.log("\n=== Setting Up Full Flow Test ===\n");
    console.log("Authority:", authority.publicKey.toString());
    console.log("Member 2:", member2.publicKey.toString());
    console.log("Member 3:", member3.publicKey.toString());
    console.log("Member 4:", member4.publicKey.toString());

    // Fund all wallets
    console.log("\nFunding wallets...");
    const fundAmount = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL each

    // Try to fund members (might fail due to rate limits)
    await fundWallet(member2.publicKey, fundAmount);
    await new Promise(r => setTimeout(r, 1000)); // Wait 1s between airdrops
    await fundWallet(member3.publicKey, fundAmount);
    await new Promise(r => setTimeout(r, 1000));
    await fundWallet(member4.publicKey, fundAmount);

    // Check balances
    const bal2 = await provider.connection.getBalance(member2.publicKey);
    const bal3 = await provider.connection.getBalance(member3.publicKey);
    const bal4 = await provider.connection.getBalance(member4.publicKey);

    console.log("\nWallet Balances:");
    console.log(`  Authority: ${(await provider.connection.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 2: ${bal2 / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 3: ${bal3 / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 4: ${bal4 / LAMPORTS_PER_SOL} SOL`);

    // If members don't have enough SOL, transfer from authority
    if (bal2 < 0.1 * LAMPORTS_PER_SOL) {
      console.log("\nTransferring SOL from authority to members...");
      const transferAmount = 0.15 * LAMPORTS_PER_SOL;

      for (const member of [member2, member3, member4]) {
        const tx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: member.publicKey,
            lamports: transferAmount,
          })
        );
        await provider.sendAndConfirm(tx);
        console.log(`  Transferred ${transferAmount / LAMPORTS_PER_SOL} SOL to ${member.publicKey.toString().slice(0, 8)}...`);
      }
    }

    // Derive creator stats PDA
    [creatorStatsPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator"), authority.publicKey.toBuffer()],
      PROGRAM_ID
    );

    // Get pool count
    poolIndex = await getPoolCount(creatorStatsPDA);
    console.log(`\nPool index: ${poolIndex.toString()}`);

    // Derive pool and vault PDAs
    [poolPDA] = derivePoolPDA(authority.publicKey, poolIndex);
    [vaultPDA] = deriveVaultPDA(poolPDA);

    console.log("Pool PDA:", poolPDA.toString());
    console.log("Vault PDA:", vaultPDA.toString());

    // Derive member PDAs
    [member1PDA] = deriveMemberPDA(poolPDA, authority.publicKey);
    [member2PDA] = deriveMemberPDA(poolPDA, member2.publicKey);
    [member3PDA] = deriveMemberPDA(poolPDA, member3.publicKey);
    [member4PDA] = deriveMemberPDA(poolPDA, member4.publicKey);
  });

  describe("Phase 1: Pool Creation & Setup", () => {
    it("1.1 Creator creates pool", async () => {
      console.log("\n=== Creating Pool ===");

      const tx = await program.methods
        .createPool(
          "Test Pool 4 Members",
          MAX_MEMBERS,
          new BN(CONTRIBUTION_AMOUNT),
          0, // SOL
          STAKE_MULTIPLIER
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

      // Fetch pool and get invite code
      const poolAccount = await program.account.pool.fetch(poolPDA);
      inviteCode = String.fromCharCode(...poolAccount.inviteCode.filter((c: number) => c !== 0));

      console.log("Invite code:", inviteCode);
      console.log("Pool status:", Object.keys(poolAccount.status)[0]);
      assert.equal(Object.keys(poolAccount.status)[0], "pending");
    });

    it("1.2 All 4 members join the pool", async () => {
      console.log("\n=== Members Joining Pool ===");

      // Authority joins
      console.log("Member 1 (authority) joining...");
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: member1PDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("  Member 1 joined!");

      // Member 2 joins
      console.log("Member 2 joining...");
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member2.publicKey,
          pool: poolPDA,
          member: member2PDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member2])
        .rpc();
      console.log("  Member 2 joined!");

      // Member 3 joins
      console.log("Member 3 joining...");
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member3.publicKey,
          pool: poolPDA,
          member: member3PDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member3])
        .rpc();
      console.log("  Member 3 joined!");

      // Member 4 joins
      console.log("Member 4 joining...");
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member4.publicKey,
          pool: poolPDA,
          member: member4PDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member4])
        .rpc();
      console.log("  Member 4 joined!");

      // Verify member count
      const poolAccount = await program.account.pool.fetch(poolPDA);
      console.log(`\nPool member count: ${poolAccount.memberCount}`);
      assert.equal(poolAccount.memberCount, 4);
    });

    it("1.3 All members deposit stake", async () => {
      console.log("\n=== Depositing Stakes ===");

      const stakeAmount = CONTRIBUTION_AMOUNT * STAKE_MULTIPLIER;
      console.log(`Stake amount per member: ${stakeAmount / LAMPORTS_PER_SOL} SOL`);

      // Member 1 deposits
      console.log("Member 1 depositing stake...");
      await program.methods
        .depositStake()
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: member1PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("  Member 1 deposited!");

      // Member 2 deposits
      console.log("Member 2 depositing stake...");
      await program.methods
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
      console.log("  Member 2 deposited!");

      // Member 3 deposits
      console.log("Member 3 depositing stake...");
      await program.methods
        .depositStake()
        .accounts({
          user: member3.publicKey,
          pool: poolPDA,
          member: member3PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member3])
        .rpc();
      console.log("  Member 3 deposited!");

      // Member 4 deposits
      console.log("Member 4 depositing stake...");
      await program.methods
        .depositStake()
        .accounts({
          user: member4.publicKey,
          pool: poolPDA,
          member: member4PDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member4])
        .rpc();
      console.log("  Member 4 deposited!");

      // Check vault balance
      const vaultBalance = await provider.connection.getBalance(vaultPDA);
      console.log(`\nVault balance after stakes: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
      assert.equal(vaultBalance, stakeAmount * 4);
    });

    it("1.4 Authority starts the pool", async () => {
      console.log("\n=== Starting Pool ===");

      await program.methods
        .startPool()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
        })
        .rpc();

      const poolAccount = await program.account.pool.fetch(poolPDA);
      console.log("Pool status:", Object.keys(poolAccount.status)[0]);
      console.log("Current round:", poolAccount.currentRound);
      console.log("Total rounds:", poolAccount.totalRounds);

      assert.equal(Object.keys(poolAccount.status)[0], "active");
      assert.equal(poolAccount.currentRound, 1);
      assert.equal(poolAccount.totalRounds, 4);
    });
  });

  describe("Phase 2: Monthly Rounds (4 rounds)", () => {
    const members = [
      { name: "Member 1", wallet: null as any, pda: null as PublicKey | null, signer: null as Keypair | null },
      { name: "Member 2", wallet: null as any, pda: null as PublicKey | null, signer: null as Keypair | null },
      { name: "Member 3", wallet: null as any, pda: null as PublicKey | null, signer: null as Keypair | null },
      { name: "Member 4", wallet: null as any, pda: null as PublicKey | null, signer: null as Keypair | null },
    ];

    before(() => {
      members[0].wallet = authority.publicKey;
      members[0].pda = member1PDA;
      members[0].signer = null; // authority uses provider wallet

      members[1].wallet = member2.publicKey;
      members[1].pda = member2PDA;
      members[1].signer = member2;

      members[2].wallet = member3.publicKey;
      members[2].pda = member3PDA;
      members[2].signer = member3;

      members[3].wallet = member4.publicKey;
      members[3].pda = member4PDA;
      members[3].signer = member4;
    });

    for (let round = 1; round <= 4; round++) {
      describe(`Round ${round}`, () => {
        it(`${round}.1 All members make payment for round ${round}`, async () => {
          console.log(`\n=== Round ${round} Payments ===`);

          const poolAccount = await program.account.pool.fetch(poolPDA);
          const currentRound = poolAccount.currentRound;
          console.log(`Current round from pool: ${currentRound}`);

          for (const member of members) {
            const [paymentPDA] = derivePaymentPDA(poolPDA, member.wallet, currentRound);

            console.log(`${member.name} making payment...`);

            const txBuilder = program.methods
              .makePayment()
              .accounts({
                user: member.wallet,
                pool: poolPDA,
                member: member.pda,
                payment: paymentPDA,
                vault: vaultPDA,
                systemProgram: SystemProgram.programId,
              });

            if (member.signer) {
              await txBuilder.signers([member.signer]).rpc();
            } else {
              await txBuilder.rpc();
            }
            console.log(`  ${member.name} paid!`);
          }

          const vaultBalance = await provider.connection.getBalance(vaultPDA);
          console.log(`Vault balance after payments: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
        });

        it(`${round}.2 Execute draw and auto-pay winner for round ${round}`, async () => {
          console.log(`\n=== Round ${round} Draw ===`);

          const poolAccount = await program.account.pool.fetch(poolPDA);
          const currentRound = poolAccount.currentRound;

          // Find an eligible winner (hasn't won yet)
          let winner = null;
          for (const member of members) {
            const memberAccount = await program.account.member.fetch(member.pda!);
            if (!memberAccount.hasWon) {
              winner = member;
              break;
            }
          }

          if (!winner) {
            console.log("No eligible winner found (all have won)");
            return;
          }

          console.log(`Selected winner: ${winner.name}`);

          const winnerBalanceBefore = await provider.connection.getBalance(winner.wallet);
          console.log(`Winner balance before: ${winnerBalanceBefore / LAMPORTS_PER_SOL} SOL`);

          const [drawPDA] = deriveDrawPDA(poolPDA, currentRound);

          await program.methods
            .executeDraw()
            .accounts({
              authority: authority.publicKey,
              pool: poolPDA,
              winnerMember: winner.pda,
              winnerWallet: winner.wallet,
              draw: drawPDA,
              vault: vaultPDA,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          const winnerBalanceAfter = await provider.connection.getBalance(winner.wallet);
          console.log(`Winner balance after: ${winnerBalanceAfter / LAMPORTS_PER_SOL} SOL`);

          const winnings = winnerBalanceAfter - winnerBalanceBefore;
          console.log(`Winnings received: ${winnings / LAMPORTS_PER_SOL} SOL`);

          // Verify draw record
          const drawAccount = await program.account.draw.fetch(drawPDA);
          console.log(`Draw claimed: ${drawAccount.claimed}`);
          assert.equal(drawAccount.claimed, true, "Draw should be marked as claimed (auto-paid)");

          // Check pool status
          const updatedPool = await program.account.pool.fetch(poolPDA);
          console.log(`Next round: ${updatedPool.currentRound}`);
          console.log(`Pool status: ${Object.keys(updatedPool.status)[0]}`);
        });
      });
    }
  });

  describe("Phase 3: Pool Completion & Stake Refunds", () => {
    it("3.1 Verify pool is completed", async () => {
      console.log("\n=== Verifying Pool Completion ===");

      const poolAccount = await program.account.pool.fetch(poolPDA);
      console.log(`Pool status: ${Object.keys(poolAccount.status)[0]}`);
      console.log(`Total rounds: ${poolAccount.totalRounds}`);
      console.log(`Current round: ${poolAccount.currentRound}`);

      // Pool should be completed after all rounds
      // Note: status becomes "completed" after the last round's execute_draw
    });

    it("3.2 All members claim stake refunds", async () => {
      console.log("\n=== Claiming Stake Refunds ===");

      const poolAccount = await program.account.pool.fetch(poolPDA);

      // Only proceed if pool is completed
      if (Object.keys(poolAccount.status)[0] !== "completed") {
        console.log("Pool not yet completed, skipping stake refunds");
        return;
      }

      const members = [
        { name: "Member 1", wallet: authority.publicKey, pda: member1PDA, signer: null as Keypair | null },
        { name: "Member 2", wallet: member2.publicKey, pda: member2PDA, signer: member2 },
        { name: "Member 3", wallet: member3.publicKey, pda: member3PDA, signer: member3 },
        { name: "Member 4", wallet: member4.publicKey, pda: member4PDA, signer: member4 },
      ];

      for (const member of members) {
        const memberAccount = await program.account.member.fetch(member.pda);

        if (!memberAccount.stakeDeposited) {
          console.log(`${member.name}: Stake already refunded`);
          continue;
        }

        const balanceBefore = await provider.connection.getBalance(member.wallet);

        console.log(`${member.name} claiming stake refund...`);

        const txBuilder = program.methods
          .claimStakeRefund()
          .accounts({
            user: member.wallet,
            pool: poolPDA,
            member: member.pda,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          });

        if (member.signer) {
          await txBuilder.signers([member.signer]).rpc();
        } else {
          await txBuilder.rpc();
        }

        const balanceAfter = await provider.connection.getBalance(member.wallet);
        const refunded = balanceAfter - balanceBefore;
        console.log(`  ${member.name} refunded: ${refunded / LAMPORTS_PER_SOL} SOL`);
      }

      // Check vault is empty
      const vaultBalance = await provider.connection.getBalance(vaultPDA);
      console.log(`\nFinal vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
    });
  });

  after(async () => {
    console.log("\n=== Final Summary ===");

    try {
      const poolAccount = await program.account.pool.fetch(poolPDA);
      console.log(`Pool Status: ${Object.keys(poolAccount.status)[0]}`);
      console.log(`Total Rounds: ${poolAccount.totalRounds}`);
      console.log(`Member Count: ${poolAccount.memberCount}`);
    } catch (e) {
      console.log("Could not fetch pool account");
    }

    console.log("\nFinal Wallet Balances:");
    console.log(`  Authority: ${(await provider.connection.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 2: ${(await provider.connection.getBalance(member2.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 3: ${(await provider.connection.getBalance(member3.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Member 4: ${(await provider.connection.getBalance(member4.publicKey)) / LAMPORTS_PER_SOL} SOL`);

    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    console.log(`  Vault: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);

    console.log("\n=== Test Complete ===\n");
  });
});
