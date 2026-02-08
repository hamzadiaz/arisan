import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAdminDb } from "@/lib/firebase-admin";

// Treasury wallet for fiat on-ramp
// In production, this should be a multisig or hardware wallet
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

let treasuryKeypair: Keypair | null = null;

function getTreasuryKeypair(): Keypair | null {
  if (treasuryKeypair) return treasuryKeypair;

  if (!TREASURY_PRIVATE_KEY) {
    console.error("Treasury private key not configured");
    return null;
  }

  try {
    // Support both base58 and JSON array formats
    if (TREASURY_PRIVATE_KEY.startsWith("[")) {
      const secretKey = new Uint8Array(JSON.parse(TREASURY_PRIVATE_KEY));
      treasuryKeypair = Keypair.fromSecretKey(secretKey);
    } else {
      // Base58 encoded
      const bs58 = require("bs58");
      const secretKey = bs58.decode(TREASURY_PRIVATE_KEY);
      treasuryKeypair = Keypair.fromSecretKey(secretKey);
    }
    return treasuryKeypair;
  } catch (error) {
    console.error("Failed to load treasury keypair:", error);
    return null;
  }
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// Transfer SOL from treasury to user's custodial wallet
export async function transferSolToUser(
  destinationAddress: string,
  amountSol: number
): Promise<TransferResult> {
  const treasury = getTreasuryKeypair();
  if (!treasury) {
    return { success: false, error: "Treasury not configured" };
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const destination = new PublicKey(destinationAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Check treasury balance
    const balance = await connection.getBalance(treasury.publicKey);
    if (balance < lamports + 5000) {
      // 5000 lamports for fees
      console.error("Treasury balance insufficient:", balance / LAMPORTS_PER_SOL, "SOL");
      return { success: false, error: "Treasury balance insufficient" };
    }

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: destination,
        lamports,
      })
    );

    // Send and confirm
    const signature = await sendAndConfirmTransaction(connection, transaction, [treasury]);

    console.log(`Transferred ${amountSol} SOL to ${destinationAddress}: ${signature}`);

    return { success: true, signature };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transfer failed";
    console.error("Treasury transfer failed:", error);
    return { success: false, error: message };
  }
}

// Record deposit in Firestore
export async function recordDeposit(
  userId: string,
  sessionId: string,
  amountUsd: number,
  amountSol: number,
  walletAddress: string,
  signature?: string
): Promise<void> {
  const db = getAdminDb();

  await db.collection("fiat_deposits").doc(sessionId).set({
    userId,
    amountUsd,
    amountSol,
    walletAddress,
    signature: signature || null,
    status: signature ? "completed" : "pending",
    createdAt: new Date(),
    completedAt: signature ? new Date() : null,
  });
}

// Update deposit status
export async function updateDepositStatus(
  sessionId: string,
  status: "pending" | "completed" | "failed",
  signature?: string,
  error?: string
): Promise<void> {
  const db = getAdminDb();

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (signature) {
    updateData.signature = signature;
    updateData.completedAt = new Date();
  }

  if (error) {
    updateData.error = error;
  }

  await db.collection("fiat_deposits").doc(sessionId).update(updateData);
}

// Get treasury balance (for monitoring)
export async function getTreasuryBalance(): Promise<number | null> {
  const treasury = getTreasuryKeypair();
  if (!treasury) return null;

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const balance = await connection.getBalance(treasury.publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error("Failed to get treasury balance:", error);
    return null;
  }
}

// Get treasury address
export function getTreasuryAddress(): string | null {
  const treasury = getTreasuryKeypair();
  return treasury?.publicKey.toBase58() || null;
}
