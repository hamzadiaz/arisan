const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const path = require('path');
const fs = require('fs');
const { expect } = require("chai");
const BN = require("bn.js");

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

function derivePoolPDA(authority: PublicKey, poolCount: any): [PublicKey, number] {
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

describe("Arisan Full Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const authority = (provider.wallet as any).payer;

  let poolPDA: PublicKey;
  let vaultPDA: PublicKey;
  let creatorStatsPDA: PublicKey;
  let poolCount: any;
  let member2: any;
  let member3: any;
  let member4: any;

  before(async () => {
    console.log("\n========================================");
    console.log("    ARISAN FULL TEST SUITE");
    console.log("========================================\n");
    console.log("Authority:", authority.publicKey.toString());

    // Generate member keypairs
    member2 = Keypair.generate();
    member3 = Keypair.generate();
    member4 = Keypair.generate();

    console.log("Member 2:", member2.publicKey.toString());
    console.log("Member 3:", member3.publicKey.toString());
    console.log("Member 4:", member4.publicKey.toString());

    // Fund members
    console.log("\n--- Funding members ---");
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

    // Get creator stats
    [creatorStatsPDA] = deriveCreatorStatsPDA(authority.publicKey);
    console.log("\nCreatorStats PDA:", creatorStatsPDA.toString());

    poolCount = new BN(0);
    try {
      const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
      if (accountInfo && accountInfo.data.length >= 16) {
        const poolCountBytes = accountInfo.data.slice(8, 16);
        poolCount = new BN(poolCountBytes, 'le');
        console.log("Existing pool count:", poolCount.toString());
      }
    } catch (e) {
      console.log("CreatorStats not found, using pool count = 0");
    }

    [poolPDA] = derivePoolPDA(authority.publicKey, poolCount);
    [vaultPDA] = deriveVaultPDA(poolPDA);

    console.log("Pool PDA:", poolPDA.toString());
    console.log("Vault PDA:", vaultPDA.toString());
  });

  describe("Test 1: Create Pool with stake_enabled=true", () => {
    it("should create a pool with stake enabled", async () => {
      const tx = await program.methods
        .createPool("Test Pool", 4, new BN(CONTRIBUTION_AMOUNT), 0, STAKE_MULTIPLIER, true)
        .accounts({
          authority: authority.publicKey,
          creatorStats: creatorStatsPDA,
          pool: poolPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Pool created! Tx:", tx);

      const pool = await program.account.pool.fetch(poolPDA);
      expect(pool.stakeEnabled).to.be.true;
      expect(pool.gracePeriodSeconds.toNumber()).to.equal(172800); // 48 hours
      console.log("Invite code:", Buffer.from(pool.inviteCode).toString('utf8'));
      console.log("Status:", Object.keys(pool.status)[0]);
      console.log("Stake enabled:", pool.stakeEnabled);
      console.log("Grace period:", pool.gracePeriodSeconds.toNumber(), "seconds");
    });
  });

  describe("Test 2: Members Join Pool", () => {
    let inviteCode: string;

    before(async () => {
      const pool = await program.account.pool.fetch(poolPDA);
      inviteCode = Buffer.from(pool.inviteCode).toString('utf8');
    });

    it("should allow authority to join", async () => {
      const [memberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: authority.publicKey,
          pool: poolPDA,
          member: memberPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const member = await program.account.member.fetch(memberPDA);
      expect(member.isKicked).to.be.false;
      expect(member.inDefault).to.be.false;
      expect(member.inGracePeriod).to.be.false;
      console.log("Authority joined!");
    });

    it("should allow member2 to join", async () => {
      const [memberPDA] = deriveMemberPDA(poolPDA, member2.publicKey);
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member2.publicKey,
          pool: poolPDA,
          member: memberPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member2])
        .rpc();
      console.log("Member 2 joined!");
    });

    it("should allow member3 to join", async () => {
      const [memberPDA] = deriveMemberPDA(poolPDA, member3.publicKey);
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member3.publicKey,
          pool: poolPDA,
          member: memberPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member3])
        .rpc();
      console.log("Member 3 joined!");
    });

    it("should allow member4 to join", async () => {
      const [memberPDA] = deriveMemberPDA(poolPDA, member4.publicKey);
      await program.methods
        .joinPool(inviteCode)
        .accounts({
          user: member4.publicKey,
          pool: poolPDA,
          member: memberPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([member4])
        .rpc();
      console.log("Member 4 joined!");
    });
  });

  describe("Test 3: Deposit Stakes", () => {
    it("should allow all members to deposit stakes", async () => {
      const members = [
        { wallet: authority.publicKey, signer: null },
        { wallet: member2.publicKey, signer: member2 },
        { wallet: member3.publicKey, signer: member3 },
        { wallet: member4.publicKey, signer: member4 },
      ];

      for (const member of members) {
        const [memberPDA] = deriveMemberPDA(poolPDA, member.wallet);
        const txBuilder = program.methods
          .depositStake()
          .accounts({
            user: member.wallet,
            pool: poolPDA,
            member: memberPDA,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          });

        if (member.signer) {
          await txBuilder.signers([member.signer]).rpc();
        } else {
          await txBuilder.rpc();
        }
        console.log("Stake deposited by", member.wallet.toString().slice(0, 8));
      }

      const vaultBalance = await provider.connection.getBalance(vaultPDA);
      console.log("Vault balance after stakes:", vaultBalance / LAMPORTS_PER_SOL, "SOL");
      expect(vaultBalance).to.be.greaterThan(0);
    });
  });

  describe("Test 4: Start Pool", () => {
    it("should start the pool", async () => {
      await program.methods
        .startPool()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPDA);
      expect(Object.keys(pool.status)[0]).to.equal("active");
      console.log("Pool started! Status:", Object.keys(pool.status)[0]);
      console.log("Current round:", pool.currentRound);
    });
  });

  describe("Test 5: Make Payments (Round 1)", () => {
    it("should allow all members to pay for round 1", async () => {
      const members = [
        { wallet: authority.publicKey, signer: null },
        { wallet: member2.publicKey, signer: member2 },
        { wallet: member3.publicKey, signer: member3 },
        { wallet: member4.publicKey, signer: member4 },
      ];

      const pool = await program.account.pool.fetch(poolPDA);
      const currentRound = pool.currentRound;

      for (const member of members) {
        const [memberPDA] = deriveMemberPDA(poolPDA, member.wallet);
        const [paymentPDA] = derivePaymentPDA(poolPDA, member.wallet, currentRound);

        const txBuilder = program.methods
          .makePayment()
          .accounts({
            user: member.wallet,
            pool: poolPDA,
            member: memberPDA,
            payment: paymentPDA,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          });

        if (member.signer) {
          await txBuilder.signers([member.signer]).rpc();
        } else {
          await txBuilder.rpc();
        }
        console.log("Payment made by", member.wallet.toString().slice(0, 8), "for round", currentRound);
      }
    });
  });

  describe("Test 6: Execute Draw (Round 1)", () => {
    it("should execute draw and pay winner", async () => {
      const pool = await program.account.pool.fetch(poolPDA);
      const currentRound = pool.currentRound;

      // Find eligible winner (authority for simplicity)
      const [winnerMemberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);
      const [drawPDA] = deriveDrawPDA(poolPDA, currentRound);

      const winnerBalanceBefore = await provider.connection.getBalance(authority.publicKey);

      await program.methods
        .executeDraw()
        .accounts({
          authority: authority.publicKey,
          pool: poolPDA,
          winnerMember: winnerMemberPDA,
          winnerWallet: authority.publicKey,
          draw: drawPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const winnerBalanceAfter = await provider.connection.getBalance(authority.publicKey);
      const winnings = (winnerBalanceAfter - winnerBalanceBefore) / LAMPORTS_PER_SOL;
      console.log("Draw executed! Winner received:", winnings.toFixed(4), "SOL");

      const poolAfter = await program.account.pool.fetch(poolPDA);
      console.log("Next round:", poolAfter.currentRound);
    });
  });

  describe("Test 7: Verify Member State", () => {
    it("should have correct member state with new fields", async () => {
      const [memberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);
      const member = await program.account.member.fetch(memberPDA);

      console.log("\n--- Member State ---");
      console.log("has_won:", member.hasWon);
      console.log("won_round:", member.wonRound);
      console.log("stake_deposited:", member.stakeDeposited);
      console.log("in_default:", member.inDefault);
      console.log("in_grace_period:", member.inGracePeriod);
      console.log("grace_deadline:", member.graceDeadline.toNumber());
      console.log("is_kicked:", member.isKicked);
      console.log("missed_rounds:", member.missedRounds);

      expect(member.hasWon).to.be.true;
      expect(member.inDefault).to.be.false;
      expect(member.inGracePeriod).to.be.false;
      expect(member.isKicked).to.be.false;
    });
  });

  describe("Test 8: Verify Pool State", () => {
    it("should have correct pool state with new fields", async () => {
      const pool = await program.account.pool.fetch(poolPDA);

      console.log("\n--- Pool State ---");
      console.log("stake_enabled:", pool.stakeEnabled);
      console.log("grace_period_seconds:", pool.gracePeriodSeconds.toNumber());
      console.log("current_round:", pool.currentRound);
      console.log("status:", Object.keys(pool.status)[0]);

      expect(pool.stakeEnabled).to.be.true;
      expect(pool.gracePeriodSeconds.toNumber()).to.equal(172800);
    });
  });
});
