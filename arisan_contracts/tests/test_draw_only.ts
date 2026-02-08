import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const idlPath = path.join(__dirname, '../target/idl/arisan_contracts.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const PROGRAM_ID = new PublicKey("BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6");

// Use the most recent pool from our test
const POOL_PDA = new PublicKey("GDEoJZuu9gDcdhVvsAt3E5k2eAV25QRtLMhL9LbPBJm2");
const VAULT_PDA = new PublicKey("BXGyZu7SNsMSfvR1BYHo7Xb9GPWP3Re7ECPkXF7qSKCB");

function deriveMemberPDA(poolPDA: PublicKey, userWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), poolPDA.toBuffer(), userWallet.toBuffer()],
    PROGRAM_ID
  );
}

function deriveDrawPDA(poolPDA: PublicKey, round: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("draw"), poolPDA.toBuffer(), Buffer.from([round])],
    PROGRAM_ID
  );
}

async function testDraw() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  console.log("\n=== Testing Execute Draw ===");
  console.log("Pool:", POOL_PDA.toString());
  console.log("Vault:", VAULT_PDA.toString());

  // Fetch pool state
  const poolAccount = await program.account.pool.fetch(POOL_PDA);
  console.log("Pool status:", Object.keys(poolAccount.status)[0]);
  console.log("Current round:", poolAccount.currentRound);
  console.log("Total rounds:", poolAccount.totalRounds);
  console.log("Member count:", poolAccount.memberCount);

  // Use authority as winner (first member)
  const authority = provider.wallet.publicKey;
  const [memberPDA] = deriveMemberPDA(POOL_PDA, authority);

  // Check member status
  const memberAccount = await program.account.member.fetch(memberPDA);
  console.log("\nMember (authority):");
  console.log("  hasWon:", memberAccount.hasWon);
  console.log("  stakeDeposited:", memberAccount.stakeDeposited);

  const currentRound = poolAccount.currentRound;
  const [drawPDA] = deriveDrawPDA(POOL_PDA, currentRound);
  console.log("\nDraw PDA for round", currentRound, ":", drawPDA.toString());

  // Check vault balance
  const vaultBalance = await provider.connection.getBalance(VAULT_PDA);
  console.log("Vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

  console.log("\nExecuting draw...");

  try {
    const tx = await program.methods
      .executeDraw()
      .accounts({
        authority: authority,
        pool: POOL_PDA,
        winnerMember: memberPDA,
        winnerWallet: authority,
        draw: drawPDA,
        vault: VAULT_PDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Success! TX:", tx);

    // Check result
    const newPoolAccount = await program.account.pool.fetch(POOL_PDA);
    console.log("New current round:", newPoolAccount.currentRound);
  } catch (err: any) {
    console.error("Error executing draw:");
    console.error(err.message);
    if (err.logs) {
      console.error("\nProgram logs:");
      err.logs.forEach((log: string) => console.error("  " + log));
    }
  }
}

testDraw();
