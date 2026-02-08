# Arisan Production Roadmap

## Executive Summary

This document outlines the path from current devnet deployment to production-ready mainnet launch, including web2 integration for users without crypto wallets.

**Current Status:** Devnet MVP with SHA256 invite codes
**Target:** Production-ready with custodial wallet support

---

## Critical Issues to Address Before Launch

### Security (MUST FIX)

| Issue | Severity | Status | Fix |
|-------|----------|--------|-----|
| Exposed private keys in .env.local | CRITICAL | Pending | Rotate all keys, add to .gitignore |
| Pseudo-random draw selection | CRITICAL | Pending | Integrate Switchboard VRF |
| Invite code in transaction logs | HIGH | Pending | Return via simulation or secure channel |
| Missing input validation (frontend) | HIGH | Pending | Add comprehensive validation |
| No rate limiting on cron endpoint | HIGH | Pending | Add rate limiting + IP whitelist |
| Wallet signature not verified on link | MEDIUM | Pending | Add server-side verification |

### Functionality (SHOULD FIX)

| Issue | Priority | Status | Fix |
|-------|----------|--------|-----|
| Hardcoded 5-minute draw interval | HIGH | Pending | Make configurable |
| SPL token support incomplete | HIGH | Pending | Implement token vaults |
| No transaction retry logic | MEDIUM | Pending | Add exponential backoff |
| Settings page doesn't save | LOW | Pending | Implement persistence |

---

## Phase 1: Security Hardening (Week 1-2)

### 1.1 Immediate Actions (Day 1)

```bash
# 1. Rotate exposed scheduler key
solana-keygen new -o ~/.config/solana/scheduler-new.json --force

# 2. Add .env.local to gitignore
echo ".env.local" >> .gitignore
echo "*.local" >> .gitignore

# 3. Remove from git history (if needed)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env.local' \
  --prune-empty --tag-name-filter cat -- --all
```

### 1.2 Input Validation (Day 2-3)

**Frontend validation in create pool:**
```typescript
// src/app/pools/create/page.tsx
const validateForm = (): boolean => {
  // Name validation
  if (!formData.name.trim() || formData.name.length > 32) {
    setError("Pool name must be 1-32 characters");
    return false;
  }

  // Amount validation
  const amount = parseFloat(formData.monthlyAmount);
  if (isNaN(amount) || amount <= 0 || amount > 1000000) {
    setError("Amount must be between 0.001 and 1,000,000");
    return false;
  }

  // Members validation
  const members = parseInt(formData.maxMembers);
  if (isNaN(members) || members < 2 || members > 20) {
    setError("Members must be between 2 and 20");
    return false;
  }

  return true;
};
```

**Invite code validation:**
```typescript
// Before joining
if (!/^[A-Z0-9]{8}$/.test(inviteCode)) {
  poolToasts.invalidInviteCode();
  return;
}
```

### 1.3 Rate Limiting (Day 4)

**Cron endpoint protection:**
```typescript
// src/app/api/cron/draw/route.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, "60 s"), // 1 request per minute
});

export async function GET(request: Request) {
  // Verify Vercel cron header
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // ... rest of handler
}
```

### 1.4 Error Boundaries (Day 5)

**Create error boundary component:**
```typescript
// src/components/error-boundary.tsx
"use client";

import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## Phase 2: Web2 Custodial Wallet Integration (Week 2-4)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Experience                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Web3 User (has wallet)          Web2 User (no wallet)         │
│   ┌─────────────────────┐         ┌─────────────────────┐       │
│   │ Connect Phantom     │         │ Sign up with Email  │       │
│   │ Sign transactions   │         │ Firebase Auth       │       │
│   │ Direct on-chain     │         │ Fiat payments       │       │
│   └─────────────────────┘         └─────────────────────┘       │
│             │                               │                    │
│             │                               │                    │
│             ▼                               ▼                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Arisan Backend                        │   │
│   │  ┌─────────────────┐    ┌─────────────────────────────┐ │   │
│   │  │  Direct TX      │    │  Custodial Wallet Service   │ │   │
│   │  │  (user signs)   │    │  - Generate keypair per user│ │   │
│   │  │                 │    │  - Encrypt with AES-256-GCM │ │   │
│   │  │                 │    │  - Sign on behalf of user   │ │   │
│   │  └────────┬────────┘    └──────────────┬──────────────┘ │   │
│   │           │                            │                 │   │
│   │           └────────────┬───────────────┘                 │   │
│   │                        │                                 │   │
│   │                        ▼                                 │   │
│   │           ┌────────────────────────┐                     │   │
│   │           │   Solana Program       │                     │   │
│   │           │   (same for both)      │                     │   │
│   │           └────────────────────────┘                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Custodial Wallet Service (Firestore + AES-256-GCM)

**MVP Approach:** Use AES-256-GCM encryption with keys stored in Firestore. Simpler than AWS KMS, free, good enough for MVP. Upgrade to KMS when handling serious volume.

**Setup:**
```bash
# Generate 32-byte encryption key (run once, add to .env.local)
echo "CUSTODIAL_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
```

**Firestore Security Rules (CRITICAL):**
```javascript
// firestore.rules - custodial wallets are server-only
match /custodial_wallets/{userId} {
  allow read, write: if false; // Only accessible via Admin SDK
}
```

**Create secure wallet generation:**
```typescript
// src/lib/custodial/wallet-service.ts
import { Keypair } from "@solana/web3.js";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.CUSTODIAL_ENCRYPTION_KEY!; // 32 bytes hex

// Encrypt private key with AES-256-GCM
function encrypt(data: Uint8Array): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

// Decrypt private key
function decrypt(encryptedData: string): Uint8Array {
  const [ivB64, tagB64, dataB64] = encryptedData.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

export async function createCustodialWallet(userId: string): Promise<string> {
  // Check if wallet already exists
  const existing = await getDoc(doc(db, "custodial_wallets", userId));
  if (existing.exists()) {
    return existing.data().publicKey;
  }

  // Generate new keypair
  const keypair = Keypair.generate();
  const encrypted = encrypt(keypair.secretKey);

  // Store encrypted key in Firestore
  await setDoc(doc(db, "custodial_wallets", userId), {
    publicKey: keypair.publicKey.toBase58(),
    encryptedKey: encrypted,
    createdAt: new Date(),
    isActive: true,
  });

  return keypair.publicKey.toBase58();
}

export async function getCustodialKeypair(userId: string): Promise<Keypair> {
  const walletDoc = await getDoc(doc(db, "custodial_wallets", userId));
  if (!walletDoc.exists()) {
    throw new Error("Custodial wallet not found");
  }

  const decrypted = decrypt(walletDoc.data().encryptedKey);
  return Keypair.fromSecretKey(decrypted);
}
```

**Security Note:** If `CUSTODIAL_ENCRYPTION_KEY` env var is compromised, all wallets are at risk. For production scale, upgrade to AWS KMS (~$1/mo) where the master key never leaves hardware.

### 2.2 Transaction Signing Service

**API endpoint for custodial transactions:**
```typescript
// src/app/api/custodial/sign-transaction/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Connection, Transaction } from "@solana/web3.js";
import { getCustodialKeypair } from "@/lib/custodial/wallet-service";
import { verifyFirebaseToken } from "@/lib/firebase-admin";

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function POST(request: NextRequest) {
  try {
    // Verify Firebase auth token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await verifyFirebaseToken(token);
    const userId = decodedToken.uid;

    // Parse request
    const { transactionBase64, action } = await request.json();

    // Validate action is allowed
    const allowedActions = ["join_pool", "make_payment", "deposit_stake"];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ error: "Action not allowed" }, { status: 403 });
    }

    // Get user's custodial keypair
    const keypair = await getCustodialKeypair(userId);

    // Deserialize and sign transaction
    const transaction = Transaction.from(Buffer.from(transactionBase64, "base64"));

    // Verify transaction is for correct wallet
    const isValidSigner = transaction.signatures.some(
      sig => sig.publicKey.equals(keypair.publicKey)
    );
    if (!isValidSigner) {
      return NextResponse.json({ error: "Invalid transaction signer" }, { status: 400 });
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign
    transaction.sign(keypair);

    // Send
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return NextResponse.json({
      success: true,
      signature,
      explorerLink: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    });
  } catch (error: any) {
    console.error("Custodial transaction failed:", error);
    return NextResponse.json({
      error: error.message || "Transaction failed"
    }, { status: 500 });
  }
}
```

### 2.3 Fiat On-Ramp Integration

**Stripe for SOL purchases:**
```typescript
// src/app/api/payments/fund-wallet/route.ts
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getCustodialWallet } from "@/lib/custodial/wallet-service";
import { verifyFirebaseToken } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.split("Bearer ")[1];
  const decodedToken = await verifyFirebaseToken(token!);

  const { amountUsd } = await request.json();

  // Get user's custodial wallet
  const walletAddress = await getCustodialWallet(decodedToken.uid);

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: "Fund Arisan Wallet",
          description: `Add $${amountUsd} to your Arisan wallet`,
        },
        unit_amount: Math.round(amountUsd * 100),
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?funded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?funded=false`,
    metadata: {
      userId: decodedToken.uid,
      walletAddress,
      amountUsd: amountUsd.toString(),
    },
  });

  return NextResponse.json({ checkoutUrl: session.url });
}

// Webhook to process completed payments
// POST /api/payments/webhook
export async function handleStripeWebhook(request: NextRequest) {
  const sig = request.headers.get("stripe-signature")!;
  const body = await request.text();

  const event = stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, walletAddress, amountUsd } = session.metadata!;

    // Convert USD to SOL (use real-time price feed)
    const solAmount = await convertUsdToSol(parseFloat(amountUsd));

    // Transfer SOL from treasury to user's custodial wallet
    await transferFromTreasury(walletAddress, solAmount);

    // Log transaction
    await logFiatDeposit(userId, amountUsd, solAmount);
  }

  return NextResponse.json({ received: true });
}
```

### 2.4 Frontend Integration

**Dual-mode wallet hook:**
```typescript
// src/hooks/use-wallet-mode.ts
"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useState, useCallback } from "react";

export type WalletMode = "web3" | "custodial" | "none";

export function useWalletMode() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { user, userProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Determine wallet mode
  const mode: WalletMode = connected
    ? "web3"
    : (user && userProfile?.custodialWallet)
      ? "custodial"
      : "none";

  const walletAddress = mode === "web3"
    ? publicKey?.toBase58()
    : userProfile?.custodialWallet;

  // Sign and send transaction (works for both modes)
  const sendTransaction = useCallback(async (
    buildTransaction: () => Promise<Transaction>,
    action: string
  ) => {
    setIsLoading(true);

    try {
      const transaction = await buildTransaction();

      if (mode === "web3") {
        // User signs directly
        const signed = await signTransaction!(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        return { success: true, signature };
      } else if (mode === "custodial") {
        // Backend signs on behalf of user
        const response = await fetch("/api/custodial/sign-transaction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${await user!.getIdToken()}`,
          },
          body: JSON.stringify({
            transactionBase64: transaction.serialize().toString("base64"),
            action,
          }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      }

      throw new Error("No wallet available");
    } finally {
      setIsLoading(false);
    }
  }, [mode, signTransaction, user]);

  return {
    mode,
    walletAddress,
    isLoading,
    sendTransaction,
    isWeb3: mode === "web3",
    isCustodial: mode === "custodial",
    hasWallet: mode !== "none",
  };
}
```

### 2.5 Database Schema (Firestore)

```typescript
// Firestore collections

// users/{userId}
interface UserProfile {
  email: string;
  displayName?: string;
  walletAddress?: string;        // Connected web3 wallet
  custodialWallet?: string;      // Auto-generated custodial wallet
  walletMode: "web3" | "custodial";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// custodial_wallets/{userId} - SERVER ACCESS ONLY
interface CustodialWallet {
  publicKey: string;
  encryptedKey: string;          // AES-256-GCM encrypted (iv:tag:data format)
  createdAt: Timestamp;
  isActive: boolean;
  lastUsed?: Timestamp;
}

// fiat_deposits/{depositId}
interface FiatDeposit {
  userId: string;
  amountUsd: number;
  solReceived: number;
  solPriceAtTime: number;
  stripeSessionId: string;
  status: "pending" | "completed" | "failed";
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// withdrawals/{withdrawalId}
interface Withdrawal {
  userId: string;
  amountSol: number;
  amountUsd: number;
  destinationAddress?: string;    // External wallet
  bankAccountLast4?: string;      // For fiat withdrawal
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Timestamp;
}
```

---

## Phase 3: Production Infrastructure (Week 4-5)

### 3.1 Environment Configuration

```bash
# .env.production (store in Vercel/secrets manager)

# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
SOLANA_PROGRAM_ID=<new-mainnet-program-id>

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=<rotated-key>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=arisan-prod
FIREBASE_ADMIN_PRIVATE_KEY=<from-secrets-manager>

# Custodial Wallet Encryption (AES-256-GCM)
# Generate with: openssl rand -hex 32
CUSTODIAL_ENCRYPTION_KEY=<64-char-hex-string>

# Stripe (for fiat on-ramp)
STRIPE_SECRET_KEY=<live-key>
STRIPE_WEBHOOK_SECRET=<webhook-secret>

# Treasury (for fiat on-ramp SOL transfers)
TREASURY_WALLET_ADDRESS=<hot-wallet-address>
TREASURY_PRIVATE_KEY=<encrypted-or-use-multisig>

# Cron
CRON_SECRET=<32-char-random>

# Monitoring
SENTRY_DSN=<sentry-project-dsn>
```

### 3.2 Mainnet Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Smart Contract
- [ ] Integrate Switchboard VRF for randomness
- [ ] Make DRAW_INTERVAL configurable (30 days default)
- [ ] Add max contribution amount validation
- [ ] Complete security audit by external firm
- [ ] Deploy to mainnet with upgrade authority
- [ ] Verify program on Solana Explorer

### Backend
- [ ] Generate CUSTODIAL_ENCRYPTION_KEY for wallet encryption
- [ ] Configure Firestore security rules (server-only for custodial_wallets)
- [ ] Configure Stripe live mode
- [ ] Set up treasury wallet with multisig
- [ ] Configure rate limiting (Upstash Redis)
- [ ] Set up monitoring (Sentry, Datadog)
- [ ] Configure backup/recovery procedures

### Frontend
- [ ] Update RPC endpoint to mainnet
- [ ] Update program ID
- [ ] Enable production Firebase project
- [ ] Configure error tracking
- [ ] Add analytics (PostHog, Mixpanel)
- [ ] Test all flows with real transactions

### Infrastructure
- [ ] Set up Vercel production environment
- [ ] Configure custom domain with SSL
- [ ] Set up CDN caching
- [ ] Configure DDoS protection (Cloudflare)
- [ ] Set up uptime monitoring
```

### 3.3 Monitoring & Alerting

```typescript
// src/lib/monitoring.ts
import * as Sentry from "@sentry/nextjs";

export function initMonitoring() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}

// Track critical events
export function trackPoolCreated(poolId: string, creatorId: string) {
  Sentry.addBreadcrumb({
    category: "pool",
    message: `Pool created: ${poolId}`,
    level: "info",
  });
}

export function trackTransactionFailed(error: Error, context: object) {
  Sentry.captureException(error, {
    extra: context,
  });
}
```

---

## Phase 4: Launch & Scaling (Week 5-6)

### 4.1 Soft Launch Strategy

1. **Week 5: Private Beta**
   - Invite 10-20 trusted users
   - $10 max contribution limit
   - 2-person pools only
   - Daily monitoring

2. **Week 6: Expanded Beta**
   - Open to waitlist (100 users)
   - $100 max contribution
   - Up to 5-person pools
   - Weekly draws

3. **Week 7+: Public Launch**
   - Remove waitlist
   - Full contribution limits
   - All pool sizes
   - Monthly draws

### 4.2 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Smart contract bug | Insurance fund, pause mechanism |
| Treasury hack | Multisig, cold storage for reserves |
| RPC node failure | Multiple RPC providers (Helius, Quicknode) |
| Fiat payment fraud | Stripe Radar, manual review for large amounts |
| Encryption key leak | Rotate key immediately, re-encrypt all wallets |
| User key loss (custodial) | Firestore backups, key recovery procedures |

---

## Summary: Production Readiness Roadmap

```
Week 1-2: Security Hardening
├── Day 1: Rotate keys, fix gitignore
├── Day 2-3: Input validation
├── Day 4: Rate limiting
└── Day 5: Error boundaries

Week 2-4: Web2 Integration
├── Custodial wallet service (Firestore + AES-256)
├── Transaction signing API
├── Stripe fiat on-ramp
├── Dual-mode wallet hook
└── Database schema

Week 4-5: Production Infrastructure
├── Environment configuration
├── Mainnet contract deployment
├── Monitoring setup
└── Security audit

Week 5-6: Launch
├── Private beta (10 users)
├── Expanded beta (100 users)
└── Public launch
```

---

## Appendix: Cost Estimates

### Infrastructure Costs (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Pro | $20 | Hosting, serverless |
| Firebase Blaze | ~$25 | Auth, Firestore, custodial wallets |
| Upstash Redis | $10 | Rate limiting |
| Sentry | $26 | Error tracking |
| Helius RPC | $49 | Solana RPC (mainnet) |
| **Total** | **~$130/mo** | |

*Note: Custodial wallet encryption uses AES-256-GCM stored in Firestore (free). Upgrade to AWS KMS (~$1/mo) for production scale.*

### Transaction Costs (Per Pool Lifecycle)

| Action | Cost (SOL) | Notes |
|--------|------------|-------|
| Create pool | ~0.01 | Account rent |
| Join pool (per member) | ~0.005 | Member account |
| Deposit stake | ~0.0001 | Transfer |
| Make payment | ~0.0001 | Transfer + Payment account |
| Execute draw | ~0.001 | Draw account + transfer |
| **Total (10 members, 10 rounds)** | **~0.15 SOL** | ~$30 at $200/SOL |

---

## Next Steps

1. **Immediate (Today):**
   - [ ] Rotate exposed keys
   - [ ] Add .env.local to .gitignore
   - [ ] Generate CUSTODIAL_ENCRYPTION_KEY: `openssl rand -hex 32`
   - [ ] Review Firebase security rules

2. **This Week:**
   - [ ] Implement input validation
   - [ ] Add error boundaries
   - [ ] Set up rate limiting
   - [ ] Configure Firestore rules for custodial_wallets (server-only)

3. **Next Week:**
   - [ ] Implement custodial wallet service (AES-256-GCM + Firestore)
   - [ ] Build transaction signing API endpoint
   - [ ] Design fiat on-ramp flow (Stripe)

4. **Before Mainnet:**
   - [ ] Complete security audit
   - [ ] Integrate Switchboard VRF
   - [ ] Set up monitoring (Sentry)
   - [ ] Write user documentation
   - [ ] Consider upgrading to AWS KMS for wallet encryption (optional)
