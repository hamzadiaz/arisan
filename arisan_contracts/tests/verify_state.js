const anchor = require("@coral-xyz/anchor");
const { PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const path = require('path');
const fs = require('fs');
const BN = require("bn.js");

const idlPath = path.join(__dirname, '../target/idl/arisan_contracts.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

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

function deriveMemberPDA(poolPDA, userWallet) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), poolPDA.toBuffer(), userWallet.toBuffer()],
    PROGRAM_ID
  );
}

async function main() {
  console.log("\n========================================");
  console.log("    VERIFY STATE TEST");
  console.log("========================================\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const authority = provider.wallet.payer;

  console.log("Authority:", authority.publicKey.toString());

  // Get creator stats
  const [creatorStatsPDA] = deriveCreatorStatsPDA(authority.publicKey);
  console.log("CreatorStats PDA:", creatorStatsPDA.toString());

  try {
    const creatorStats = await program.account.creatorStats.fetch(creatorStatsPDA);
    console.log("Pool count:", creatorStats.poolCount.toString());

    // If pool count > 0, fetch the last pool
    if (creatorStats.poolCount.toNumber() > 0) {
      const lastPoolIndex = new BN(creatorStats.poolCount.toNumber() - 1);
      const [poolPDA] = derivePoolPDA(authority.publicKey, lastPoolIndex);
      console.log("\nFetching last pool:", poolPDA.toString());

      const pool = await program.account.pool.fetch(poolPDA);
      console.log("\n--- Pool State ---");
      console.log("Name:", Buffer.from(pool.name).toString('utf8').replace(/\0/g, ''));
      console.log("Status:", Object.keys(pool.status)[0]);
      console.log("Member count:", pool.memberCount);
      console.log("Max members:", pool.maxMembers);
      console.log("Current round:", pool.currentRound);
      console.log("Total rounds:", pool.totalRounds);
      console.log("Contribution:", pool.contributionAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("Stake multiplier:", pool.stakeMultiplier);

      // NEW FIELDS
      console.log("\n--- NEW FIELDS ---");
      console.log("stake_enabled:", pool.stakeEnabled);
      console.log("grace_period_seconds:", pool.gracePeriodSeconds.toNumber());

      // Fetch member for authority
      const [memberPDA] = deriveMemberPDA(poolPDA, authority.publicKey);
      try {
        const member = await program.account.member.fetch(memberPDA);
        console.log("\n--- Member State (Authority) ---");
        console.log("has_won:", member.hasWon);
        console.log("stake_deposited:", member.stakeDeposited);
        console.log("payments_made:", member.paymentsMade);

        // NEW FIELDS
        console.log("\n--- NEW MEMBER FIELDS ---");
        console.log("in_default:", member.inDefault);
        console.log("in_grace_period:", member.inGracePeriod);
        console.log("grace_deadline:", member.graceDeadline.toNumber());
        console.log("is_kicked:", member.isKicked);
        console.log("missed_rounds:", member.missedRounds);
      } catch (e) {
        console.log("Member not found (authority may not have joined this pool)");
      }
    }

    console.log("\n========================================");
    console.log("    VERIFICATION COMPLETE!");
    console.log("========================================\n");
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main().catch(console.error);
