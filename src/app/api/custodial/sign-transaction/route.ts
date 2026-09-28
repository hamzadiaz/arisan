import { NextRequest, NextResponse } from "next/server";
import { Connection, Transaction } from "@solana/web3.js";
import { custodialSigningEnabled, getCustodialKeypair } from "@/lib/custodial/wallet-service";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { withRateLimit } from "@/lib/rate-limit";
import { signTransactionSchema, validateInput } from "@/lib/validations";

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
);

export async function POST(request: NextRequest) {
  if (!custodialSigningEnabled()) {
    return NextResponse.json(
      { error: "Custodial signing is disabled. CLOCK IN uses a self-custodial wallet." },
      { status: 410 }
    );
  }

  try {
    // Rate limiting (strict for transaction signing)
    const rateLimitResponse = await withRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    // Verify Firebase auth token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await verifyFirebaseToken(token);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Parse and validate request body
    const body = await request.json();
    const validation = validateInput(signTransactionSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { transactionBase64, action } = validation.data;

    // Get user's custodial keypair
    let keypair;
    try {
      keypair = await getCustodialKeypair(userId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Custodial wallet error";
      return NextResponse.json(
        { error: message },
        { status: 404 }
      );
    }

    // Deserialize transaction
    let transaction: Transaction;
    try {
      const buffer = Buffer.from(transactionBase64, "base64");
      transaction = Transaction.from(buffer);
    } catch {
      return NextResponse.json(
        { error: "Invalid transaction format" },
        { status: 400 }
      );
    }

    // Verify the transaction requires our custodial wallet as a signer
    const requiresOurSignature = transaction.signatures.some(
      (sig) => sig.publicKey.equals(keypair.publicKey)
    );

    if (!requiresOurSignature) {
      return NextResponse.json(
        { error: "Transaction does not require this wallet's signature" },
        { status: 400 }
      );
    }

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign the transaction
    transaction.sign(keypair);

    // Send the transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );

    // Confirm the transaction
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    if (confirmation.value.err) {
      return NextResponse.json(
        {
          error: "Transaction failed on-chain",
          details: confirmation.value.err,
        },
        { status: 500 }
      );
    }

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
    const explorerLink = `https://explorer.solana.com/tx/${signature}?cluster=${network}`;

    return NextResponse.json({
      success: true,
      signature,
      explorerLink,
    });
  } catch (error: unknown) {
    console.error("Custodial transaction failed:", error);
    const message = error instanceof Error ? error.message : "Transaction failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
