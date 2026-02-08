"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSolanaPoolActions } from "@/hooks/use-solana-program";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, Info, Users, Calendar, Coins, AlertCircle, Wallet, Shield, Copy, Check, PartyPopper } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { poolToasts, txErrorToast, walletRequiredToast, dismissToast } from "@/lib/solana/transaction-toast";

export default function CreatePoolPage() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { createPool, isLoading } = useSolanaPoolActions();
  const { hasWallet, walletPublicKey } = useWalletMode();
  const [error, setError] = useState<string | null>(null);

  // Use either web3 or custodial public key
  const activePublicKey = walletPublicKey || publicKey;

  // Success dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdPoolAddress, setCreatedPoolAddress] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    maxMembers: "10",
    monthlyAmount: "",
    currency: "SOL" as "SOL" | "USDC" | "USDT",
    durationMonths: "same",
    stakeMultiplier: "1",
    stakeEnabled: true,
    autoMode: false, // Auto mode: pre-fund all payments on join, auto-start when full
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check wallet connection first (either web3 or custodial)
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    // Validate pool name
    if (!formData.name.trim()) {
      setError("Please enter a pool name");
      return;
    }

    const maxMembers = parseInt(formData.maxMembers);
    const monthlyAmount = parseFloat(formData.monthlyAmount);
    const stakeMultiplier = parseInt(formData.stakeMultiplier) as 1 | 2 | 3;

    if (isNaN(monthlyAmount) || monthlyAmount <= 0) {
      setError("Please enter a valid monthly amount");
      return;
    }

    // Show loading toast
    const loadingToastId = poolToasts.creating();

    try {
      const result = await createPool({
        name: formData.name,
        maxMembers,
        contributionAmount: monthlyAmount,
        currency: formData.currency,
        stakeMultiplier,
        stakeEnabled: formData.stakeEnabled,
        autoMode: formData.autoMode,
      });

      // Dismiss loading toast
      dismissToast(loadingToastId);

      if (result.success && result.poolAddress) {
        // Show success toast with explorer link
        poolToasts.created(result.signature!, formData.name.slice(0, 8).toUpperCase());

        // Save the invite code and show success dialog
        setCreatedPoolAddress(result.poolAddress);
        setInviteCode(result.inviteCode || null);
        setShowSuccessDialog(true);
      } else {
        setError(result.error || "Failed to create pool");
        txErrorToast(result.error || "Failed to create pool");
      }
    } catch (err: any) {
      dismissToast(loadingToastId);
      setError(err.message || "Failed to create pool");
      txErrorToast(err.message || "Failed to create pool");
    }
  };

  const totalPot =
    parseFloat(formData.monthlyAmount || "0") *
    parseInt(formData.maxMembers || "0");
  const stakeAmount = formData.stakeEnabled
    ? parseFloat(formData.monthlyAmount || "0") *
      parseInt(formData.stakeMultiplier || "1")
    : 0;

  // Format amounts with appropriate decimals
  const formatAmount = (amount: number): string => {
    const decimals = formData.currency === "SOL" ? 4 : 2;
    return parseFloat(amount.toFixed(decimals)).toString();
  };

  // Copy invite code to clipboard
  const copyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success("Invite code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Navigate to pool page
  const goToPool = () => {
    if (createdPoolAddress) {
      router.push(`/pools/${createdPoolAddress}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href="/pools"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pools
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Create a New Pool</h1>
        <p className="text-muted-foreground">
          Set up a rotating savings pool and invite your friends to join.
        </p>
      </div>

      {!hasWallet && (
        <Alert>
          <Wallet className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span>Connect your wallet or sign in to create an on-chain pool</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setVisible(true)}>
                Connect Wallet
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/auth">Sign In</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
            <CardDescription>
              Give your pool a name and description.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Pool Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Family Savings Pool"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the purpose of this pool..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
                disabled={isLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pool Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pool Settings</CardTitle>
            <CardDescription>
              Configure the size and duration of your pool.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxMembers">Maximum Members *</Label>
                <Select
                  value={formData.maxMembers}
                  onValueChange={(value) =>
                    setFormData({ ...formData, maxMembers: value })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 6, 7, 8, 9, 10, 12, 15, 20].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} members
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMonths">Duration *</Label>
                <Select
                  value={formData.durationMonths}
                  onValueChange={(value) =>
                    setFormData({ ...formData, durationMonths: value })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "same", label: "Same as members" },
                      { value: "6", label: "6 months" },
                      { value: "12", label: "12 months" },
                    ].map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                The pool duration equals the number of members. Each round, one
                member wins the pot until everyone has won exactly once.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Financial Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Financial Settings</CardTitle>
            <CardDescription>
              Set the contribution amount and stake requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyAmount">Monthly Contribution *</Label>
                <Input
                  id="monthlyAmount"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="1.0"
                  value={formData.monthlyAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, monthlyAmount: e.target.value })
                  }
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value: "SOL" | "USDC" | "USDT") =>
                    setFormData({ ...formData, currency: value })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stakeMultiplier">Stake Multiplier</Label>
                <Select
                  value={formData.stakeMultiplier}
                  onValueChange={(value) =>
                    setFormData({ ...formData, stakeMultiplier: value })
                  }
                  disabled={isLoading || !formData.stakeEnabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (Standard)</SelectItem>
                    <SelectItem value="2">2x (Higher security)</SelectItem>
                    <SelectItem value="3">3x (Maximum security)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stake Enable Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="stakeEnabled" className="font-medium">Require Stake Deposit</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formData.stakeEnabled
                    ? "Members must deposit collateral to join. Protects against defaults."
                    : "No stake required. Trust-based pool with no collateral."}
                </p>
              </div>
              <Switch
                id="stakeEnabled"
                checked={formData.stakeEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, stakeEnabled: checked })
                }
                disabled={isLoading}
              />
            </div>

            {/* Auto Mode Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-primary/5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <Label htmlFor="autoMode" className="font-medium">Auto Mode</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formData.autoMode
                    ? "Pool auto-starts when full. Draws trigger automatically on schedule. Miss a payment? 48h grace period, then kicked."
                    : "Standard mode: Members pay monthly. Pool must be started manually."}
                </p>
              </div>
              <Switch
                id="autoMode"
                checked={formData.autoMode}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, autoMode: checked })
                }
                disabled={isLoading}
              />
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-3">
              <h4 className="font-medium">Pool Summary</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <Coins className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">
                    {formatAmount(totalPot)} {formData.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">Pot per round</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{formData.maxMembers}</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">
                    {formData.durationMonths === "same"
                      ? formData.maxMembers
                      : formData.durationMonths || formData.maxMembers}
                  </p>
                  <p className="text-xs text-muted-foreground">Months</p>
                </div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Required stake deposit
                  </span>
                  <span className="font-semibold">
                    {formData.stakeEnabled
                      ? `${formatAmount(stakeAmount)} ${formData.currency}`
                      : "None (trust-based)"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.stakeEnabled
                    ? "This deposit is locked as collateral and returned after pool completion."
                    : "This pool operates on trust without requiring stake deposits."}
                </p>
              </div>

              {formData.autoMode && (
                <div className="p-3 border-2 border-primary rounded-lg bg-primary/5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-primary">
                      Auto Mode Benefits
                    </span>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>• Pool auto-starts when all members join</li>
                    <li>• Draws trigger automatically on schedule</li>
                    <li>• {formData.stakeEnabled ? `Stake (${formatAmount(stakeAmount)} ${formData.currency}) collected on join` : "No stake required"}</li>
                    <li>• Monthly payments still required ({formatAmount(parseFloat(formData.monthlyAmount || "0"))} {formData.currency}/month)</li>
                    <li>• Miss payment = 48h grace period, then kicked</li>
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isLoading || !hasWallet}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Pool...
              </>
            ) : (
              "Create Pool"
            )}
          </Button>
        </div>
      </form>

      {/* Success Dialog with Invite Code */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-primary" />
              Pool Created Successfully!
            </DialogTitle>
            <DialogDescription>
              Your pool &quot;{formData.name}&quot; has been created on-chain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {inviteCode ? (
              <>
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
                  <Label className="text-sm font-medium text-primary">Your Invite Code</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 px-4 py-3 bg-background rounded-md font-mono text-2xl tracking-widest text-center border">
                      {inviteCode}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyInviteCode}
                      className="h-12 w-12"
                    >
                      {copied ? (
                        <Check className="h-5 w-5 text-primary" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>

                <Alert variant="destructive" className="border-yellow-500 bg-yellow-500/10 text-yellow-700">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700">
                    <strong>Save this code now!</strong> For security, invite codes are only shown once
                    and cannot be retrieved later. Share this code with friends to let them join your pool.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Could not retrieve invite code from transaction logs.
                  You can find it by checking the transaction on Solana Explorer.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={copyInviteCode}
                disabled={!inviteCode}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Code
              </Button>
              <Button className="flex-1" onClick={goToPool}>
                Go to Pool
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
