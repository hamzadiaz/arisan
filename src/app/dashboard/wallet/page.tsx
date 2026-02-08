"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wallet,
  CreditCard,
  Copy,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowDownToLine,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { LAMPORTS_PER_SOL, PublicKey, Connection } from "@solana/web3.js";

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com"
);

export default function WalletPage() {
  const searchParams = useSearchParams();
  const { userProfile, firebaseUser, createCustodialWallet } = useAuth();
  const { mode, walletAddress, isCustodial } = useWalletMode();

  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [fundAmount, setFundAmount] = useState("25");
  const [solQuote, setSolQuote] = useState<{
    solAmount: number;
    solPrice: number;
    feeUsd: number;
    totalUsd: number;
  } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Handle success/cancelled query params
  useEffect(() => {
    if (searchParams.get("funded") === "true") {
      toast.success("Wallet funded successfully! Your SOL will arrive shortly.");
    }
    if (searchParams.get("cancelled") === "true") {
      toast.info("Payment cancelled");
    }
  }, [searchParams]);

  // Fetch balance
  const fetchBalance = async () => {
    if (!walletAddress) return;

    setIsLoadingBalance(true);
    try {
      const pubkey = new PublicKey(walletAddress);
      const lamports = await connection.getBalance(pubkey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      setBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [walletAddress]);

  // Fetch SOL quote when amount changes
  useEffect(() => {
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount < 5 || amount > 1000) {
      setSolQuote(null);
      return;
    }

    const fetchQuote = async () => {
      setIsLoadingQuote(true);
      try {
        const response = await fetch(`/api/stripe/checkout?amount=${amount}`);
        if (response.ok) {
          const data = await response.json();
          setSolQuote(data);
        }
      } catch (error) {
        console.error("Failed to fetch quote:", error);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounce);
  }, [fundAmount]);

  // Copy address to clipboard
  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast.success("Address copied to clipboard");
    }
  };

  // Create custodial wallet
  const handleCreateWallet = async () => {
    setIsCreatingWallet(true);
    try {
      const address = await createCustodialWallet();
      if (address) {
        toast.success("Wallet created successfully!");
        fetchBalance();
      } else {
        toast.error("Failed to create wallet");
      }
    } catch (error) {
      toast.error("Failed to create wallet");
    } finally {
      setIsCreatingWallet(false);
    }
  };

  // Start Stripe checkout
  const handleFundWallet = async () => {
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount < 5 || amount > 1000) {
      toast.error("Amount must be between $5 and $1,000");
      return;
    }

    if (!firebaseUser) {
      toast.error("Please sign in to continue");
      return;
    }

    setIsCheckingOut(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ amountUsd: amount }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start checkout";
      toast.error(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const explorerUrl = walletAddress
    ? `https://explorer.solana.com/address/${walletAddress}?cluster=${network}`
    : null;

  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Wallet</h1>
          <p className="text-muted-foreground mt-2">
            Manage your wallet and fund your account
          </p>
        </div>

        {/* No Wallet State */}
        {mode === "none" && (
          <GlassCard>
            <GlassCardContent className="py-12 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Wallet Connected</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Connect a Solana wallet or create a custodial wallet to start
                participating in pools.
              </p>
              <Button onClick={handleCreateWallet} disabled={isCreatingWallet}>
                {isCreatingWallet ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Create Custodial Wallet
              </Button>
            </GlassCardContent>
          </GlassCard>
        )}

        {/* Wallet Info */}
        {walletAddress && (
          <>
            <GlassCard>
              <GlassCardHeader>
                <GlassCardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {isCustodial ? "Custodial Wallet" : "Connected Wallet"}
                </GlassCardTitle>
              </GlassCardHeader>
              <GlassCardContent className="space-y-6">
                {/* Balance */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div>
                    <p className="text-sm text-muted-foreground">Balance</p>
                    <div className="flex items-baseline gap-2">
                      {isLoadingBalance ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <>
                          <span className="text-3xl font-bold">
                            {balance !== null ? balance.toFixed(4) : "—"}
                          </span>
                          <span className="text-lg text-muted-foreground">SOL</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="icon" onClick={fetchBalance}>
                    <RefreshCw className={`h-4 w-4 ${isLoadingBalance ? "animate-spin" : ""}`} />
                  </Button>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Wallet Address</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 rounded-lg bg-muted/50 text-sm font-mono truncate">
                      {walletAddress}
                    </code>
                    <Button variant="outline" size="icon" onClick={copyAddress}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    {explorerUrl && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {isCustodial && (
                  <Alert className="border-primary/30 bg-primary/5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <AlertDescription>
                      This is a custodial wallet managed by Arisan. Your private key is
                      securely encrypted and stored. You can fund this wallet with a credit
                      card below.
                    </AlertDescription>
                  </Alert>
                )}
              </GlassCardContent>
            </GlassCard>

            {/* Fund Wallet (Custodial only) */}
            {isCustodial && (
              <GlassCard>
                <GlassCardHeader>
                  <GlassCardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Fund Wallet
                  </GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="space-y-6">
                  <p className="text-muted-foreground">
                    Purchase SOL with your credit card to fund your wallet. Funds are
                    deposited directly into your custodial wallet.
                  </p>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (USD)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="amount"
                          type="number"
                          min="5"
                          max="1000"
                          step="5"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          className="pl-7"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Min: $5 &bull; Max: $1,000
                      </p>
                    </div>

                    {/* Quick amounts */}
                    <div className="flex gap-2 flex-wrap">
                      {[10, 25, 50, 100].map((amount) => (
                        <Button
                          key={amount}
                          variant={fundAmount === amount.toString() ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFundAmount(amount.toString())}
                        >
                          ${amount}
                        </Button>
                      ))}
                    </div>

                    <Separator />

                    {/* Quote */}
                    {solQuote && (
                      <div className="space-y-2 p-4 rounded-lg bg-muted/30">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">You pay</span>
                          <span>${solQuote.totalUsd.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Processing fee (3%)</span>
                          <span>${solQuote.feeUsd.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">SOL price</span>
                          <span>${solQuote.solPrice.toFixed(2)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-medium">
                          <span>You receive</span>
                          <span className="text-primary">
                            {solQuote.solAmount.toFixed(4)} SOL
                          </span>
                        </div>
                      </div>
                    )}

                    {isLoadingQuote && (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleFundWallet}
                      disabled={isCheckingOut || !solQuote}
                    >
                      {isCheckingOut ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowDownToLine className="h-4 w-4 mr-2" />
                      )}
                      Fund with Card
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Powered by Stripe. Your payment information is never stored on our
                      servers.
                    </p>
                  </div>
                </GlassCardContent>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
