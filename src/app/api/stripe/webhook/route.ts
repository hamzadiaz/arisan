import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { transferSolToUser, recordDeposit, updateDepositStatus } from "@/lib/treasury";
import Stripe from "stripe";

// Disable body parsing for webhook (need raw body for signature verification)
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("Missing Stripe signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const event = verifyWebhookSignature(body, signature);
    if (!event) {
      console.error("Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log(`Stripe webhook received: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`Checkout session expired: ${session.id}`);
        // Optionally record the expired session
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment failed: ${paymentIntent.id}`);
        // Handle failed payment
        if (paymentIntent.metadata?.sessionId) {
          await updateDepositStatus(
            paymentIntent.metadata.sessionId,
            "failed",
            undefined,
            paymentIntent.last_payment_error?.message || "Payment failed"
          );
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    const message = error instanceof Error ? error.message : "Webhook failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;

  if (!metadata || metadata.type !== "sol_deposit") {
    console.log("Not a SOL deposit session, skipping");
    return;
  }

  const { userId, walletAddress, solAmount, amountUsd } = metadata;

  if (!userId || !walletAddress || !solAmount || !amountUsd) {
    console.error("Missing metadata in checkout session:", session.id);
    return;
  }

  const solAmountNum = parseFloat(solAmount);
  const amountUsdNum = parseFloat(amountUsd);

  console.log(`Processing SOL deposit for user ${userId}:`);
  console.log(`  Amount: $${amountUsdNum} -> ${solAmountNum} SOL`);
  console.log(`  Wallet: ${walletAddress}`);

  // Record the pending deposit
  await recordDeposit(
    userId,
    session.id,
    amountUsdNum,
    solAmountNum,
    walletAddress
  );

  // Transfer SOL from treasury to user's wallet
  const result = await transferSolToUser(walletAddress, solAmountNum);

  if (result.success) {
    console.log(`SOL transfer successful: ${result.signature}`);
    await updateDepositStatus(session.id, "completed", result.signature);
  } else {
    console.error(`SOL transfer failed: ${result.error}`);
    await updateDepositStatus(session.id, "failed", undefined, result.error);

    // TODO: Alert admin for manual intervention
    // TODO: Consider automatic retry mechanism
  }
}
