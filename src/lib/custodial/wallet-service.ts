import { Keypair } from "@solana/web3.js";
import { getAdminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

/** CLOCK IN is self-custodial. Key loading stays off unless this is exactly "true". */
export function custodialSigningEnabled(): boolean {
  return process.env.CUSTODIAL_SIGNING_ENABLED === "true";
}

function assertCustodialEnabled(): void {
  if (!custodialSigningEnabled()) {
    throw new Error("Custodial signing is disabled");
  }
}

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.CUSTODIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CUSTODIAL_ENCRYPTION_KEY not configured");
  }
  if (key.length !== 64) {
    throw new Error("CUSTODIAL_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

// Encrypt private key with AES-256-GCM
function encrypt(data: Uint8Array): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

// Decrypt private key
function decrypt(encryptedData: string): Uint8Array {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

// Create a new custodial wallet for a user
export async function createCustodialWallet(userId: string): Promise<string> {
  assertCustodialEnabled();
  const db = getAdminDb();
  const walletRef = db.collection("custodial_wallets").doc(userId);

  // Check if wallet already exists
  const existing = await walletRef.get();
  if (existing.exists) {
    const data = existing.data();
    return data?.publicKey as string;
  }

  // Generate new keypair
  const keypair = Keypair.generate();
  const encrypted = encrypt(keypair.secretKey);

  // Store encrypted key in Firestore
  await walletRef.set({
    publicKey: keypair.publicKey.toBase58(),
    encryptedKey: encrypted,
    createdAt: new Date(),
    isActive: true,
  });

  return keypair.publicKey.toBase58();
}

// Get custodial wallet public key for a user
export async function getCustodialWalletAddress(userId: string): Promise<string | null> {
  const db = getAdminDb();
  const walletRef = db.collection("custodial_wallets").doc(userId);
  const doc = await walletRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data()?.publicKey as string;
}

// Get the full keypair for signing transactions (server-side only!)
export async function getCustodialKeypair(userId: string): Promise<Keypair> {
  assertCustodialEnabled();
  const db = getAdminDb();
  const walletRef = db.collection("custodial_wallets").doc(userId);
  const doc = await walletRef.get();

  if (!doc.exists) {
    throw new Error("Custodial wallet not found");
  }

  const data = doc.data();
  if (!data?.encryptedKey) {
    throw new Error("Wallet data corrupted");
  }

  if (!data.isActive) {
    throw new Error("Custodial wallet is deactivated");
  }

  // Update last used timestamp
  await walletRef.update({
    lastUsed: new Date(),
  });

  const decrypted = decrypt(data.encryptedKey);
  return Keypair.fromSecretKey(decrypted);
}

// Deactivate a custodial wallet (e.g., if user exports to external wallet)
export async function deactivateCustodialWallet(userId: string): Promise<void> {
  const db = getAdminDb();
  const walletRef = db.collection("custodial_wallets").doc(userId);

  await walletRef.update({
    isActive: false,
    deactivatedAt: new Date(),
  });
}

// Check if user has a custodial wallet
export async function hasCustodialWallet(userId: string): Promise<boolean> {
  const db = getAdminDb();
  const walletRef = db.collection("custodial_wallets").doc(userId);
  const doc = await walletRef.get();
  return doc.exists && doc.data()?.isActive === true;
}
