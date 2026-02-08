import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { createCheckoutSession, getSolPriceUsd, calculateSolForUsd } from "@/lib/stripe";
import { withRateLimit } from "@/lib/rate-limit";
import { fundWalletSchema, validateInput } from "@/lib/validations";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
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
    const validation = validateInput(fundWalletSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { amountUsd } = validation.data;

    // Get user's custodial wallet address
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.custodialWallet) {
      return NextResponse.json(
        { error: "No custodial wallet found. Please create one first." },
        { status: 400 }
      );
    }

    const walletAddress = userData.custodialWallet;

    // Get current SOL price for display
    const { solAmount, solPrice, feeUsd, totalUsd } = await calculateSolForUsd(amountUsd);

    // Create Stripe checkout session
    const origin = request.headers.get("origin") || "http://localhost:3000";
    const session = await createCheckoutSession({
      userId,
      walletAddress,
      amountUsd,
      successUrl: `${origin}/dashboard/wallet?funded=true`,
      cancelUrl: `${origin}/dashboard/wallet?cancelled=true`,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Failed to create checkout session. Stripe may not be configured." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      quote: {
        amountUsd,
        solAmount,
        solPrice,
        feeUsd,
        totalUsd,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      },
    });
  } catch (error: unknown) {
    console.error("Checkout session creation failed:", error);
    const message = error instanceof Error ? error.message : "Failed to create checkout";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET endpoint to get current SOL price and quote
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const amountStr = searchParams.get("amount");

    if (!amountStr) {
      // Just return current SOL price
      const solPrice = await getSolPriceUsd();
      return NextResponse.json({ solPrice });
    }

    const amountUsd = parseFloat(amountStr);
    if (isNaN(amountUsd) || amountUsd < 5 || amountUsd > 1000) {
      return NextResponse.json(
        { error: "Amount must be between $5 and $1,000" },
        { status: 400 }
      );
    }

    const { solAmount, solPrice, feeUsd, totalUsd } = await calculateSolForUsd(amountUsd);

    return NextResponse.json({
      amountUsd,
      solAmount,
      solPrice,
      feeUsd,
      totalUsd,
    });
  } catch (error: unknown) {
    console.error("Failed to get SOL quote:", error);
    return NextResponse.json(
      { error: "Failed to get quote" },
      { status: 500 }
    );
  }
}
