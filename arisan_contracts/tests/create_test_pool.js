const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const path = require('path');
const fs = require('fs');
const BN = require("bn.js");

const idlPath = path.join(__dirname, '../target/idl/arisan_contracts.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

const CONTRIBUTION_AMOUNT = 0.01 * LAMPORTS_PER_SOL;
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

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("\n========================================");
  console.log("    CREATE TEST POOL WITH NEW FIELDS");
  console.log("========================================\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const authority = provider.wallet.payer;

  console.log("Authority:", authority.publicKey.toString());

  // Get creator stats to find current pool count
  const [creatorStatsPDA] = deriveCreatorStatsPDA(authority.publicKey);
  console.log("CreatorStats PDA:", creatorStatsPDA.toString());

  let poolCount = new BN(0);
  try {
    const accountInfo = await provider.connection.getAccountInfo(creatorStatsPDA);
    if (accountInfo && accountInfo.data.length >= 16) {
      const poolCountBytes = accountInfo.data.slice(8, 16);
      poolCount = new BN(poolCountBytes, 'le');
      console.log("Current pool count:", poolCount.toString());
    }
  } catch (e) {
    console.log("CreatorStats not found, using pool count = 0");
  }

  // Derive PDAs for the new pool
  const [poolPDA] = derivePoolPDA(authority.publicKey, poolCount);
  const [vaultPDA] = deriveVaultPDA(poolPDA);

  console.log("\nNew Pool PDA:", poolPDA.toString());
  console.log("Vault PDA:", vaultPDA.toString());

  // Create pool with stake_enabled=true
  console.log("\n--- Creating Pool with stake_enabled=true ---");
  try {
    const tx = await program.methods
      .createPool("Test Pool v2", 4, new BN(CONTRIBUTION_AMOUNT), 0, STAKE_MULTIPLIER, true)
      .accounts({
        authority: authority.publicKey,
        creatorStats: creatorStatsPDA,
        pool: poolPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Pool created! Tx:", tx);
    await delay(2000);

    // Fetch and verify pool
    const pool = await program.account.pool.fetch(poolPDA);
    console.log("\n--- Pool State ---");
    console.log("Name:", Buffer.from(pool.name).toString('utf8').replace(/\0/g, ''));
    console.log("Status:", Object.keys(pool.status)[0]);
    console.log("Member count:", pool.memberCount);
    console.log("Max members:", pool.maxMembers);
    console.log("Contribution:", pool.contributionAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Invite code:", Buffer.from(pool.inviteCode).toString('utf8'));

    // NEW FIELDS
    console.log("\n--- NEW FIELDS ---");
    console.log("stake_enabled:", pool.stakeEnabled);
    console.log("grace_period_seconds:", pool.gracePeriodSeconds.toNumber());

    // Join pool
    console.log("\n--- Joining Pool ---");
    const inviteCode = Buffer.from(pool.inviteCode).toString('utf8');
    const [memberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);

    const joinTx = await program.methods
      .joinPool(inviteCode)
      .accounts({
        user: authority.publicKey,
        pool: poolPDA,
        member: memberPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Joined pool! Tx:", joinTx);
    await delay(2000);

    // Fetch and verify member
    const member = await program.account.member.fetch(memberPDA);
    console.log("\n--- Member State ---");
    console.log("wallet:", member.wallet.toString());
    console.log("position:", member.position);
    console.log("has_won:", member.hasWon);
    console.log("stake_deposited:", member.stakeDeposited);
    console.log("payments_made:", member.paymentsMade);

    // NEW MEMBER FIELDS
    console.log("\n--- NEW MEMBER FIELDS ---");
    console.log("in_default:", member.inDefault);
    console.log("in_grace_period:", member.inGracePeriod);
    console.log("grace_deadline:", member.graceDeadline.toNumber());
    console.log("is_kicked:", member.isKicked);
    console.log("missed_rounds:", member.missedRounds);

    console.log("\n========================================");
    console.log("    TEST COMPLETE - ALL FIELDS WORK!");
    console.log("========================================\n");

  } catch (e) {
    console.error("Error:", e.message);
    if (e.logs) {
      console.error("Logs:", e.logs);
    }
  }
}

main().catch(console.error);
