import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const idlPath = path.join(__dirname, '../target/idl/arisan_contracts.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

// Configuration
const CONTRIBUTION_AMOUNT = 0.01 * LAMPORTS_PER_SOL;
const STAKE_MULTIPLIER = 1;

// Derive PDAs
function deriveCreatorStatsPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), authority.toBuffer()],
    PROGRAM_ID
  );
}

function derivePoolPDA(authority: PublicKey, poolCount: BN): [PublicKey, number] {
  // pool_count is u64, so use 8-byte little-endian buffer
  const poolCountBuf = poolCount.toArrayLike(Buffer, 'le', 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), authority.toBuffer(), poolCountBuf],
    PROGRAM_ID
  );
}

function deriveVaultPDA(poolPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolPDA.toBuffer()],
    PROGRAM_ID
  );
}

function deriveMemberPDA(poolPDA: PublicKey, userWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), poolPDA.toBuffer(), userWallet.toBuffer()],
    PROGRAM_ID
  );
}

function derivePaymentPDA(poolPDA: PublicKey, userWallet: PublicKey, round: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), poolPDA.toBuffer(), userWallet.toBuffer(), Buffer.from([round])],
    PROGRAM_ID
  );
}

function deriveDrawPDA(poolPDA: PublicKey, round: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("draw"), poolPDA.toBuffer(), Buffer.from([round])],
    PROGRAM_ID
  );
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFullFlowTest() {
  console.log("\n========================================");
  console.log("    ARISAN FULL FLOW TEST - 4 USERS    ");
  console.log("========================================\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  const authority = (provider.wallet as anchor.Wallet).payer;

  // Generate member keypairs
  const member2 = Keypair.generate();
  const member3 = Keypair.generate();
  const member4 = Keypair.generate();

  console.log("Authority:", authority.publicKey.toString());
  console.log("Member 2:", member2.publicKey.toString());
  console.log("Member 3:", member3.publicKey.toString());
  console.log("Member 4:", member4.publicKey.toString());

  // Fund members via transfer from authority
  console.log("\n--- Funding members (transfer from authority) ---");
  for (const member of [member2, member3, member4]) {
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
    await delay(200);
  }

  // Get or derive CreatorStats to determine pool count
  const [creatorStatsPDA] = deriveCreatorStatsPDA(authority.publicKey);
  console.log("\nCreatorStats PDA:", creatorStatsPDA.toString());

  let poolCount = new BN(0);
  try {
    // Try to read raw account data since IDL discriminator might not match
    const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
    if (accountInfo && accountInfo.data.length >= 16) {
      // Skip 8-byte discriminator, read 8-byte u64 pool_count
      const poolCountBytes = accountInfo.data.slice(8, 16);
      poolCount = new BN(poolCountBytes, 'le');
      console.log("Existing pool count (from raw):", poolCount.toString());
    } else {
      console.log("CreatorStats not found, will be created (pool count = 0)");
    }
  } catch (e) {
    console.log("Error reading CreatorStats, using pool count = 0");
  }

  // Derive Pool and Vault PDAs using the pool count
  const [poolPDA] = derivePoolPDA(authority.publicKey, poolCount);
  const [vaultPDA] = deriveVaultPDA(poolPDA);

  console.log("Pool PDA:", poolPDA.toString());
  console.log("Vault PDA:", vaultPDA.toString());

  // Phase 1: Create Pool
  console.log("\n--- Phase 1: Create Pool ---");
  try {
    await program.methods
      .createPool("Test Pool", 4, new BN(CONTRIBUTION_AMOUNT), 0, STAKE_MULTIPLIER)
      .accounts({
        authority: authority.publicKey,
        creatorStats: creatorStatsPDA,
        pool: poolPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Pool created!");

    const pool = await program.account.pool.fetch(poolPDA);
    console.log("Invite code:", Buffer.from(pool.inviteCode).toString('utf8'));
    console.log("Status:", Object.keys(pool.status)[0]);
  } catch (e: any) {
    console.error("Create pool failed:", e.message);
    if (e.logs) {
      console.error("Program logs:");
      e.logs.forEach((log: string) => console.error("  " + log));
    }
    return;
  }

  // Phase 2: Members join
  console.log("\n--- Phase 2: Members Join ---");
  const pool = await program.account.pool.fetch(poolPDA);
  const inviteCode = Buffer.from(pool.inviteCode).toString('utf8');

  const members = [
    { name: "Member 1 (authority)", wallet: authority.publicKey, signer: null, pda: null as any },
    { name: "Member 2", wallet: member2.publicKey, signer: member2, pda: null as any },
    { name: "Member 3", wallet: member3.publicKey, signer: member3, pda: null as any },
    { name: "Member 4", wallet: member4.publicKey, signer: member4, pda: null as any },
  ];

  for (const member of members) {
    const [memberPDA] = deriveMemberPDA(poolPDA, member.wallet);
    member.pda = memberPDA;

    try {
      const txBuilder = program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member.wallet,
          pool: poolPDA,
          member: memberPDA,
          systemProgram: SystemProgram.programId,
        });

      if (member.signer) {
        await txBuilder.signers([member.signer]).rpc();
      } else {
        await txBuilder.rpc();
      }
      console.log(member.name, "joined!");
    } catch (e: any) {
      console.error(member.name, "join failed:", e.message);
    }
  }

  // Phase 3: Deposit stakes
  console.log("\n--- Phase 3: Deposit Stakes ---");
  for (const member of members) {
    try {
      const txBuilder = program.methods
        .depositStake()
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
      console.log(member.name, "deposited stake!");
    } catch (e: any) {
      console.error(member.name, "deposit failed:", e.message);
    }
  }

  const vaultBalance = await provider.connection.getBalance(vaultPDA);
  console.log("Vault balance after stakes:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

  // Phase 4: Start pool
  console.log("\n--- Phase 4: Start Pool ---");
  try {
    await program.methods
      .startPool()
      .accounts({
        authority: authority.publicKey,
        pool: poolPDA,
      })
      .rpc();

    const poolAfterStart = await program.account.pool.fetch(poolPDA);
    console.log("Pool started!");
    console.log("Status:", Object.keys(poolAfterStart.status)[0]);
    console.log("Current round:", poolAfterStart.currentRound);
    console.log("Total rounds:", poolAfterStart.totalRounds);
  } catch (e: any) {
    console.error("Start pool failed:", e.message);
    return;
  }

  // Phase 5: Run 4 rounds
  console.log("\n--- Phase 5: Run 4 Rounds ---");

  for (let round = 1; round <= 4; round++) {
    console.log("\n=== ROUND", round, "===");

    // All members make payments
    console.log("Making payments...");
    const poolBefore = await program.account.pool.fetch(poolPDA);
    const currentRound = poolBefore.currentRound;

    for (const member of members) {
      const [paymentPDA] = derivePaymentPDA(poolPDA, member.wallet, currentRound);

      try {
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
        console.log(" ", member.name, "paid for round", currentRound);
      } catch (e: any) {
        console.error(" ", member.name, "payment failed:", e.message);
      }
    }

    // Find eligible winner (hasn't won yet)
    let winner = null;
    for (const member of members) {
      const memberAcc = await program.account.member.fetch(member.pda);
      if (!memberAcc.hasWon) {
        winner = member;
        break;
      }
    }

    if (!winner) {
      console.log("No eligible winner found!");
      continue;
    }

    console.log("Selected winner:", winner.name);

    // Execute draw
    const [drawPDA] = deriveDrawPDA(poolPDA, currentRound);
    const winnerBalanceBefore = await provider.connection.getBalance(winner.wallet);

    try {
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
      const winnings = (winnerBalanceAfter - winnerBalanceBefore) / LAMPORTS_PER_SOL;
      console.log("Draw executed! Winner received:", winnings.toFixed(4), "SOL");

      const poolAfterDraw = await program.account.pool.fetch(poolPDA);
      console.log("Pool status:", Object.keys(poolAfterDraw.status)[0]);
      console.log("Next round:", poolAfterDraw.currentRound);
    } catch (e: any) {
      console.error("Execute draw failed:", e.message);
      if (e.logs) {
        console.error("Program logs:");
        e.logs.forEach((log: string) => console.error("  " + log));
      }
    }
  }

  // Phase 6: Verify completion and refund stakes
  console.log("\n--- Phase 6: Verify & Refund ---");
  const finalPool = await program.account.pool.fetch(poolPDA);
  console.log("Final pool status:", Object.keys(finalPool.status)[0]);
  console.log("Total rounds:", finalPool.totalRounds);
  console.log("Current round:", finalPool.currentRound);

  if (Object.keys(finalPool.status)[0] === "completed") {
    console.log("\nRefunding stakes...");
    for (const member of members) {
      const memberAcc = await program.account.member.fetch(member.pda);
      if (memberAcc.stakeDeposited) {
        try {
          await program.methods
            .refundAllStakes()
            .accounts({
              payer: authority.publicKey,
              pool: poolPDA,
              member: member.pda,
              memberWallet: member.wallet,
              vault: vaultPDA,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log(member.name, "stake refunded!");
        } catch (e: any) {
          console.error(member.name, "refund failed:", e.message);
        }
      }
    }
  }

  // Final balances
  console.log("\n--- Final Balances ---");
  console.log("Authority:", (await provider.connection.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL, "SOL");
  console.log("Member 2:", (await provider.connection.getBalance(member2.publicKey)) / LAMPORTS_PER_SOL, "SOL");
  console.log("Member 3:", (await provider.connection.getBalance(member3.publicKey)) / LAMPORTS_PER_SOL, "SOL");
  console.log("Member 4:", (await provider.connection.getBalance(member4.publicKey)) / LAMPORTS_PER_SOL, "SOL");
  console.log("Vault:", (await provider.connection.getBalance(vaultPDA)) / LAMPORTS_PER_SOL, "SOL");

  console.log("\n========================================");
  console.log("           TEST COMPLETE               ");
  console.log("========================================\n");
}

runFullFlowTest().catch(console.error);
