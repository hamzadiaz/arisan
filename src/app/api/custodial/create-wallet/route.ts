import { NextRequest, NextResponse } from "next/server";
import { createCustodialWallet, getCustodialWalletAddress } from "@/lib/custodial/wallet-service";
import { verifyFirebaseToken, getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
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

    // Check if user already has a custodial wallet
    const existingWallet = await getCustodialWalletAddress(userId);
    if (existingWallet) {
      return NextResponse.json({
        success: true,
        walletAddress: existingWallet,
        isNew: false,
      });
    }

    // Create new custodial wallet
    const walletAddress = await createCustodialWallet(userId);

    // Update user profile with custodial wallet address
    const db = getAdminDb();
    await db.collection("users").doc(userId).update({
      custodialWallet: walletAddress,
      walletMode: "custodial",
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      walletAddress,
      isNew: true,
    });
  } catch (error: unknown) {
    console.error("Failed to create custodial wallet:", error);
    const message = error instanceof Error ? error.message : "Failed to create wallet";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET endpoint to check if user has a custodial wallet
export async function GET(request: NextRequest) {
  try {
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

    const walletAddress = await getCustodialWalletAddress(decodedToken.uid);

    return NextResponse.json({
      hasCustodialWallet: !!walletAddress,
      walletAddress: walletAddress || null,
    });
  } catch (error: unknown) {
    console.error("Failed to check custodial wallet:", error);
    const message = error instanceof Error ? error.message : "Failed to check wallet";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
