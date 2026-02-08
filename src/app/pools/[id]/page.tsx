"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { FetchedPool, FetchedMember, FetchedPayment, FetchedDraw } from "@/lib/solana/accounts";
import { getAddressLink } from "@/lib/solana/instructions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  poolToasts,
  txErrorToast,
  walletRequiredToast,
  dismissToast,
} from "@/lib/solana/transaction-toast";
import {
  ArrowLeft,
  Users,
  Calendar,
  Clock,
  Trophy,
  Wallet,
  Share2,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Bell,
  Lock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Crown,
} from "lucide-react";

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") || "devnet";

export default function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { hasWallet, walletAddress, walletPublicKey } = useWalletMode();

  // Use either web3 or custodial public key
  const activePublicKey = walletPublicKey || publicKey;

  // Solana hooks
  const {
    makePayment,
    depositStake,
    claimWinnings,
    startPool,
    joinPool,
    isLoading: actionLoading
  } = useSolanaPoolActions();
  const {
    getPool,
    getPoolMembers,
    getPoolPayments,
    getPoolDraws,
    getMemberAccount,
    isReady
  } = useSolanaPoolData();

  // State
  const [pool, setPool] = useState<FetchedPool | null>(null);
  const [members, setMembers] = useState<FetchedMember[]>([]);
  const [payments, setPayments] = useState<FetchedPayment[]>([]);
  const [draws, setDraws] = useState<FetchedDraw[]>([]);
  const [myMember, setMyMember] = useState<FetchedMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [poolSettings, setPoolSettings] = useState({
    paymentReminders: true,
    drawNotifications: true,
    memberAlerts: true,
  });
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  // Fetch all pool data
  const fetchPoolData = useCallback(async () => {
    if (!isReady) return;

    try {
      const [poolData, membersData, paymentsData, drawsData] = await Promise.all([
        getPool(poolId),
        getPoolMembers(poolId),
        getPoolPayments(poolId),
        getPoolDraws(poolId),
      ]);

      setPool(poolData);
      setMembers(membersData);
      setPayments(paymentsData);
      setDraws(drawsData);

      // Get current user's member account (works for both web3 and custodial wallets)
      if (activePublicKey) {
        const memberAccount = await getMemberAccount(poolId);
        setMyMember(memberAccount);
      }
    } catch (error) {
      console.error("Failed to fetch pool data:", error);
      toast.error("Failed to load pool data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isReady, poolId, activePublicKey, getPool, getPoolMembers, getPoolPayments, getPoolDraws, getMemberAccount]);

  // Initial load
  useEffect(() => {
    fetchPoolData();
  }, [fetchPoolData]);

  // Set up real-time subscription
  useEffect(() => {
    if (!connection || !poolId) return;

    let subscriptionId: number | null = null;

    try {
      const poolPubkey = new PublicKey(poolId);
      subscriptionId = connection.onAccountChange(
        poolPubkey,
        () => {
          // Refetch all data when pool account changes
          fetchPoolData();
        },
        "confirmed"
      );
    } catch (error) {
      console.error("Failed to subscribe to pool updates:", error);
    }

    return () => {
      if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId);
      }
    };
  }, [connection, poolId, fetchPoolData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPoolData();
  };

  const copyPoolLink = () => {
    if (!pool) return;
    const link = `${window.location.origin}/pools/${pool.id}`;
    navigator.clipboard.writeText(link);
    toast.success("Pool link copied to clipboard!");
  };

  // Join pool handler - requires manual invite code entry
  const handleJoinPool = async () => {
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    if (!pool) return;

    // Validate invite code (basic validation - contract will verify hash)
    if (!joinInviteCode.trim()) {
      toast.error("Please enter the invite code");
      return;
    }

    const loadingToastId = poolToasts.joining();

    try {
      const result = await joinPool({
        poolAddress: new PublicKey(poolId),
        inviteCode: joinInviteCode.trim(),
      });

      dismissToast(loadingToastId);

      if (result.success) {
        poolToasts.joined(result.signature!);
        setShowJoinDialog(false);
        setJoinInviteCode("");
        await fetchPoolData();
      } else {
        // Check for specific error types
        const errorMsg = result.error || "";
        if (errorMsg.includes("InvalidInviteCode") || errorMsg.toLowerCase().includes("invalid invite")) {
          poolToasts.invalidInviteCode();
        } else if (errorMsg.includes("AlreadyMember")) {
          poolToasts.joinFailed("You are already a member of this pool");
        } else if (errorMsg.includes("PoolFull")) {
          poolToasts.joinFailed("This pool is full");
        } else if (errorMsg.includes("PoolNotOpen")) {
          poolToasts.joinFailed("This pool is no longer accepting new members");
        } else {
          poolToasts.joinFailed(errorMsg || "Failed to join pool");
        }
      }
    } catch (error: any) {
      dismissToast(loadingToastId);
      const errorMsg = error.message || "";
      if (errorMsg.includes("InvalidInviteCode") || errorMsg.toLowerCase().includes("invalid invite")) {
        poolToasts.invalidInviteCode();
      } else {
        poolToasts.joinFailed(errorMsg || "Failed to join pool");
      }
    }
  };

  // Payment handler
  const handleMakePayment = async () => {
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    if (!pool) return;

    const loadingToastId = poolToasts.makingPayment();

    try {
      const result = await makePayment({
        poolAddress: new PublicKey(poolId),
        round: pool.currentRound,
      });

      dismissToast(loadingToastId);

      if (result.success) {
        poolToasts.paymentMade(
          result.signature!,
          pool.monthlyAmount,
          pool.currency,
          pool.currentRound
        );
        await fetchPoolData();
      } else {
        txErrorToast(result.error || "Failed to make payment");
      }
    } catch (error: any) {
      dismissToast(loadingToastId);
      txErrorToast(error.message || "Failed to make payment");
    }
  };

  // Deposit stake handler
  const handleDepositStake = async () => {
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    if (!pool) return;

    const loadingToastId = poolToasts.depositingStake();

    try {
      const result = await depositStake({
        poolAddress: new PublicKey(poolId),
      });

      dismissToast(loadingToastId);

      if (result.success) {
        const stakeAmount = pool.monthlyAmount * (myMember?.position || 1);
        poolToasts.stakeDeposited(result.signature!, stakeAmount, pool.currency);
        await fetchPoolData();
      } else {
        txErrorToast(result.error || "Failed to deposit stake");
      }
    } catch (error: any) {
      dismissToast(loadingToastId);
      txErrorToast(error.message || "Failed to deposit stake");
    }
  };

  // Start pool handler (creator only)
  const handleStartPool = async () => {
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    if (!pool) return;

    const loadingToastId = poolToasts.startingPool();

    try {
      const result = await startPool({
        poolAddress: new PublicKey(poolId),
      });

      dismissToast(loadingToastId);

      if (result.success) {
        poolToasts.poolStarted(result.signature!);
        await fetchPoolData();
      } else {
        txErrorToast(result.error || "Failed to start pool");
      }
    } catch (error: any) {
      dismissToast(loadingToastId);
      txErrorToast(error.message || "Failed to start pool");
    }
  };

  // Claim winnings handler
  const handleClaimWinnings = async (round: number) => {
    if (!hasWallet || !activePublicKey) {
      walletRequiredToast();
      setVisible(true);
      return;
    }

    if (!pool) return;

    const loadingToastId = poolToasts.claimingWinnings();

    try {
      const result = await claimWinnings({
        poolAddress: new PublicKey(poolId),
        round,
      });

      dismissToast(loadingToastId);

      if (result.success) {
        const draw = draws.find(d => d.round === round);
        poolToasts.winningsClaimed(result.signature!, draw?.amount || 0, pool.currency);
        await fetchPoolData();
      } else {
        txErrorToast(result.error || "Failed to claim winnings");
      }
    } catch (error: any) {
      dismissToast(loadingToastId);
      txErrorToast(error.message || "Failed to claim winnings");
    }
  };

  // Helper to format amounts with appropriate decimal places
  const formatAmount = (amount: number | undefined, currency?: string): string => {
    if (amount === undefined || amount === null) return "0";
    // SOL: up to 4 decimals, USDC/USDT: up to 2 decimals
    const decimals = currency === "SOL" ? 4 : 2;
    // Remove trailing zeros
    return parseFloat(amount.toFixed(decimals)).toString();
  };

  // Calculate derived values
  const potAmount = pool ? pool.monthlyAmount * members.length : 0;
  const daysUntilDraw = pool ? Math.max(0, Math.ceil((pool.nextDrawDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  // Check if current user has paid for current round
  const hasUserPaidThisRound = payments.some(
    p => p.walletAddress === walletAddress && p.round === pool?.currentRound
  );

  // Check if user can claim winnings
  const unclaimedWin = draws.find(
    d => d.winnerAddress === walletAddress && !d.claimed
  );

  // Check if user is a member or creator
  const isMemberOrCreator = myMember || (pool && walletAddress === pool.creatorId);

  // Loading state - only show if wallet connected and data loading
  if (loading && hasWallet) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Not connected (no web3 or custodial wallet) - show connect wallet CTA
  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <Link
          href="/pools"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pools
        </Link>

        <Card className="max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Get Started</h2>
            <p className="text-muted-foreground mb-6">
              Connect your Solana wallet or sign in to view pool details and participate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button size="lg" onClick={() => setVisible(true)} className="gap-2 flex-1">
                <Wallet className="h-5 w-5" />
                Connect Wallet
              </Button>
              <Button size="lg" variant="outline" asChild className="flex-1">
                <Link href="/auth">Sign In</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Don&apos;t have a wallet? Sign in with email to get a custodial wallet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connected but not a member - show restricted view
  if (!myMember && pool) {
    const canJoin = pool.status === "pending" && members.length < pool.maxMembers;

    return (
      <div className="space-y-6">
        <Link
          href="/pools"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pools
        </Link>

        {/* Pool header - limited info */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{pool.name}</h1>
            <Badge variant={pool.status === "active" ? "default" : pool.status === "pending" ? "secondary" : "outline"}>
              {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
            </Badge>
          </div>
        </div>

        {/* Access restricted card */}
        <Card className="max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Members Only</h2>
            <p className="text-muted-foreground mb-6">
              {canJoin
                ? "Enter the invite code to join this pool and view details."
                : pool.status === "active"
                  ? "This pool is already active and not accepting new members."
                  : members.length >= pool.maxMembers
                    ? "This pool is full and not accepting new members."
                    : "This pool is not accepting new members."}
            </p>

            {/* Basic pool info */}
            <div className="w-full rounded-lg bg-muted/50 p-4 mb-6 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-left">
                  <span className="text-muted-foreground">Contribution</span>
                  <p className="font-medium">{formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency}/round</p>
                </div>
                <div className="text-left">
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium">{pool.durationMonths} rounds</p>
                </div>
                <div className="text-left">
                  <span className="text-muted-foreground">Members</span>
                  <p className="font-medium">{members.length}/{pool.maxMembers}</p>
                </div>
                <div className="text-left">
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium capitalize">{pool.status}</p>
                </div>
              </div>
            </div>

            {canJoin ? (
              <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
                <DialogTrigger asChild>
                  <Button size="lg" className="gap-2">
                    <Users className="h-5 w-5" />
                    Join Pool
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Join Pool</DialogTitle>
                    <DialogDescription>
                      Enter the invite code to join &quot;{pool.name}&quot;
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-code-restricted">Invite Code</Label>
                      <Input
                        id="invite-code-restricted"
                        placeholder="Enter invite code (e.g., ABC12345)"
                        value={joinInviteCode}
                        onChange={(e) => setJoinInviteCode(e.target.value.toUpperCase())}
                        className="font-mono text-lg tracking-wider"
                        maxLength={8}
                      />
                      <p className="text-xs text-muted-foreground">
                        Ask the pool creator for the invite code
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleJoinPool}
                      disabled={actionLoading || !joinInviteCode.trim()}
                    >
                      {actionLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        "Join Pool"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/pools">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Browse Other Pools
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pool not found
  if (!pool) {
    return (
      <div className="space-y-6">
        <Link
          href="/pools"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pools
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Pool not found. It may have been deleted or the address is invalid.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Helper to shorten address
  const shortenAddress = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  // Get member payment status for current round
  const getMemberPaymentStatus = (walletAddress: string) => {
    const paid = payments.some(
      p => p.walletAddress === walletAddress && p.round === pool.currentRound
    );
    return paid ? "paid" : "pending";
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/pools"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pools
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{pool.name}</h1>
            <Badge variant={pool.status === "active" ? "default" : pool.status === "pending" ? "secondary" : "outline"}>
              {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground font-mono">
              {shortenAddress(pool.onChainAddress)}
            </p>
            <a
              href={getAddressLink(pool.onChainAddress, NETWORK)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>

          {/* Invite Dialog - only show to members/creator */}
          {isMemberOrCreator && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Share2 className="h-4 w-4" />
                  Invite
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Members</DialogTitle>
                  <DialogDescription>
                    Share the pool with friends who have the invite code.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="rounded-lg bg-muted/50 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium mb-1">Invite Code Required</p>
                        <p className="text-muted-foreground">
                          For security, invite codes are only shown once when the pool is created.
                          The pool creator should have saved the code to share with members.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Share Pool Link</Label>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={copyPoolLink}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Pool Link
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Share this link along with the invite code. Recipients will need both to join.
                    </p>
                  </div>
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                    <p>
                      <strong>Status:</strong> {members.length}/{pool.maxMembers} members joined.
                      {pool.status === "pending" && members.length < pool.maxMembers
                        ? " Pool is accepting new members."
                        : pool.status === "active"
                          ? " Pool is active - no new members allowed."
                          : " Pool is full."}
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Settings Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Pool Settings</SheetTitle>
                <SheetDescription>
                  Manage notifications and preferences for this pool.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notifications
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Payment Reminders</Label>
                        <p className="text-xs text-muted-foreground">
                          Get reminded before payments are due
                        </p>
                      </div>
                      <Switch
                        checked={poolSettings.paymentReminders}
                        onCheckedChange={(checked) =>
                          setPoolSettings({ ...poolSettings, paymentReminders: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Draw Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified when draws happen
                        </p>
                      </div>
                      <Switch
                        checked={poolSettings.drawNotifications}
                        onCheckedChange={(checked) =>
                          setPoolSettings({ ...poolSettings, drawNotifications: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Member Alerts</Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified when members join or leave
                        </p>
                      </div>
                      <Switch
                        checked={poolSettings.memberAlerts}
                        onCheckedChange={(checked) =>
                          setPoolSettings({ ...poolSettings, memberAlerts: checked })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    On-Chain Info
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vault Balance</span>
                      <span className="font-mono">{formatAmount(pool.vaultBalance, pool.currency)} {pool.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vault Address</span>
                      <a
                        href={getAddressLink(pool.vaultAddress, NETWORK)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline flex items-center gap-1"
                      >
                        {shortenAddress(pool.vaultAddress)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Account Settings
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Join pool alert - show when connected but not a member */}
      {hasWallet && !myMember && pool.status === "pending" && members.length < pool.maxMembers && (
        <Alert className="border-primary bg-primary/10">
          <Users className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              You&apos;re not a member yet. Enter the invite code to join!
            </span>
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  Join Pool
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Join Pool</DialogTitle>
                  <DialogDescription>
                    Enter the invite code to join &quot;{pool.name}&quot;
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-code">Invite Code</Label>
                    <Input
                      id="invite-code"
                      placeholder="Enter invite code (e.g., ABC12345)"
                      value={joinInviteCode}
                      onChange={(e) => setJoinInviteCode(e.target.value.toUpperCase())}
                      className="font-mono text-lg tracking-wider"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ask the pool creator for the invite code
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Monthly contribution</span>
                      <span className="font-medium">{formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{pool.durationMonths} rounds</span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleJoinPool}
                    disabled={actionLoading || !joinInviteCode.trim()}
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      "Join Pool"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </AlertDescription>
        </Alert>
      )}

      {/* Unclaimed winnings alert */}
      {unclaimedWin && (
        <Alert className="border-green-500 bg-green-500/10">
          <Trophy className="h-4 w-4 text-green-500" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              You won Round {unclaimedWin.round}! Claim your {formatAmount(unclaimedWin.amount, pool.currency)} {pool.currency} winnings.
            </span>
            <Button
              size="sm"
              onClick={() => handleClaimWinnings(unclaimedWin.round)}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stake deposit alert - only show if stakeEnabled is true */}
      {myMember && !myMember.stakeDeposited && pool.status === "pending" && pool.stakeEnabled !== false && (
        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Deposit your stake ({formatAmount(myMember.stakeAmount, pool.currency)} {pool.currency}) to participate in draws.
            </span>
            <Button
              size="sm"
              onClick={handleDepositStake}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deposit Stake"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Start pool alert - only show to creator when pool is pending and has members */}
      {hasWallet &&
       pool.status === "pending" &&
       walletAddress === pool.creatorId &&
       members.length >= 2 && (
        <Alert className="border-blue-500 bg-blue-500/10">
          <Users className="h-4 w-4 text-blue-500" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <span className="font-medium">Ready to start the pool?</span>
              <p className="text-sm text-muted-foreground">
                {members.length === pool.maxMembers
                  ? "All members have joined!"
                  : `${members.length}/${pool.maxMembers} members joined. You can start now or wait for more.`}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleStartPool}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Pool"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Pot
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(potAmount, pool.currency)} {pool.currency}</div>
            <p className="text-xs text-muted-foreground">
              {formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency} x {members.length} members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progress
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pool.currentRound}/{pool.durationMonths}
            </div>
            <Progress
              value={(pool.currentRound / pool.durationMonths) * 100}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Next Draw
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pool.status === "pending" ? "—" : `${daysUntilDraw} days`}
            </div>
            <p className="text-xs text-muted-foreground">
              {pool.status === "pending"
                ? "Pool not started"
                : pool.nextDrawDate.toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Members
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}/{pool.maxMembers}</div>
            <p className="text-xs text-muted-foreground">
              {members.filter((m) => m.hasWon).length} have won
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Card */}
      {pool.status === "active" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Round {pool.currentRound} Payment</p>
                <p className="text-sm text-muted-foreground">
                  {hasUserPaidThisRound
                    ? "You've already paid for this round"
                    : `Pay ${formatAmount(pool.monthlyAmount, pool.currency)} ${pool.currency} before the draw`}
                </p>
              </div>
            </div>
            <Button
              disabled={hasUserPaidThisRound || actionLoading || !hasWallet}
              onClick={handleMakePayment}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : hasUserPaidThisRound ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Paid
                </>
              ) : !hasWallet ? (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </>
              ) : (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Pay {formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="history">Draw History ({draws.length})</TabsTrigger>
          <TabsTrigger value="settings">Pool Info</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pool Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {members.map((member) => {
                  const isYou = member.walletAddress === walletAddress;
                  const paymentStatus = getMemberPaymentStatus(member.walletAddress);

                  return (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isYou ? "bg-primary/5 border border-primary/20" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {member.walletAddress.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {shortenAddress(member.walletAddress)}
                            </span>
                            {member.walletAddress === pool.creatorId && (
                              <Badge variant="default" className="text-xs gap-1">
                                <Crown className="h-3 w-3" />
                                Creator
                              </Badge>
                            )}
                            {isYou && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                            {member.hasWon && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Trophy className="h-3 w-3" />
                                Won R{member.wonRound}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              Position #{member.position}
                            </span>
                            {member.stakeDeposited && (
                              <Badge variant="outline" className="text-xs">
                                Staked
                              </Badge>
                            )}
                            <a
                              href={getAddressLink(member.walletAddress, NETWORK)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pool.status === "active" && (
                          paymentStatus === "paid" ? (
                            <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600">
                              <AlertCircle className="h-3 w-3" />
                              Pending
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
                {members.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No members yet. Share the invite code to get started!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Draw History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Current round */}
                {pool.status === "active" && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full font-bold bg-primary text-primary-foreground">
                        {pool.currentRound}
                      </div>
                      <div>
                        <p className="font-medium">Current Round</p>
                        <p className="text-sm text-muted-foreground">
                          Draw on {pool.nextDrawDate.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge>In Progress</Badge>
                  </div>
                )}

                {/* Past draws */}
                {draws.map((draw) => (
                  <div
                    key={draw.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full font-bold bg-muted text-muted-foreground">
                        {draw.round}
                      </div>
                      <div>
                        <p className="font-medium">
                          Round {draw.round} - {shortenAddress(draw.winnerAddress)}
                          {draw.winnerAddress === walletAddress && (
                            <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {draw.drawnAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        +{formatAmount(draw.amount, pool.currency)} {pool.currency}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {draw.claimed ? "Claimed" : "Unclaimed"}
                      </p>
                    </div>
                  </div>
                ))}

                {draws.length === 0 && pool.status !== "active" && (
                  <p className="text-center text-muted-foreground py-8">
                    No draws yet. The first draw will happen when the pool starts.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pool Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Pool Address</p>
                  <p className="font-mono text-sm break-all">{pool.onChainAddress}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p>{pool.createdAt.toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Amount</p>
                  <p>{formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Rounds</p>
                  <p>{pool.durationMonths} rounds</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Creator</p>
                  <a
                    href={getAddressLink(pool.creatorId, NETWORK)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {shortenAddress(pool.creatorId)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vault Balance</p>
                  <p>{formatAmount(pool.vaultBalance, pool.currency)} {pool.currency}</p>
                </div>
              </div>

              <Separator />
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Secure Invite System</p>
                    <p className="text-xs text-muted-foreground">
                      For security, invite codes are only shown once when the pool is created.
                      {isMemberOrCreator
                        ? " Contact the pool creator if you need to share the code with new members."
                        : " Ask the pool creator for the invite code to join."}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
