import Stripe from "stripe";

// Initialize Stripe client
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      typescript: true,
    })
  : null;

// SOL price in cents (will be fetched dynamically in production)
// For MVP, using a fixed rate that gets updated periodically
const SOL_PRICE_CACHE: { price: number; timestamp: number } = {
  price: 0,
  timestamp: 0,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getSolPriceUsd(): Promise<number> {
  const now = Date.now();

  // Return cached price if fresh
  if (SOL_PRICE_CACHE.price > 0 && now - SOL_PRICE_CACHE.timestamp < CACHE_TTL) {
    return SOL_PRICE_CACHE.price;
  }

  try {
    // Fetch from CoinGecko (free, no API key needed for basic requests)
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      throw new Error("Failed to fetch SOL price");
    }

    const data = await response.json();
    const price = data.solana?.usd || 150; // Fallback to $150 if API fails

    SOL_PRICE_CACHE.price = price;
    SOL_PRICE_CACHE.timestamp = now;

    return price;
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    // Return last known price or fallback
    return SOL_PRICE_CACHE.price || 150;
  }
}

// Calculate SOL amount for a given USD amount (with fee)
export async function calculateSolForUsd(
  usdAmount: number,
  feePercent: number = 3
): Promise<{
  solAmount: number;
  solPrice: number;
  feeUsd: number;
  totalUsd: number;
}> {
  const solPrice = await getSolPriceUsd();
  const feeUsd = usdAmount * (feePercent / 100);
  const totalUsd = usdAmount + feeUsd;
  const netUsd = usdAmount; // User receives value of their deposit
  const solAmount = netUsd / solPrice;

  return {
    solAmount: Math.floor(solAmount * 1e9) / 1e9, // Round to 9 decimals (lamports precision)
    solPrice,
    feeUsd,
    totalUsd,
  };
}

// Create checkout session configuration
export interface CheckoutConfig {
  userId: string;
  walletAddress: string;
  amountUsd: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  config: CheckoutConfig
): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) {
    console.error("Stripe not configured");
    return null;
  }

  const { solAmount, solPrice, feeUsd, totalUsd } = await calculateSolForUsd(config.amountUsd);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "SOL Deposit",
              description: `${solAmount.toFixed(4)} SOL at $${solPrice.toFixed(2)}/SOL`,
              images: ["https://cryptologos.cc/logos/solana-sol-logo.png"],
            },
            unit_amount: Math.round(config.amountUsd * 100), // Convert to cents
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Processing Fee",
              description: "3% processing fee",
            },
            unit_amount: Math.round(feeUsd * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${config.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: config.cancelUrl,
      metadata: {
        userId: config.userId,
        walletAddress: config.walletAddress,
        solAmount: solAmount.toString(),
        solPrice: solPrice.toString(),
        amountUsd: config.amountUsd.toString(),
        type: "sol_deposit",
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    });

    return session;
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    return null;
  }
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event | null {
  if (!stripe) {
    console.error("Stripe not configured");
    return null;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook secret not configured");
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return null;
  }
}
