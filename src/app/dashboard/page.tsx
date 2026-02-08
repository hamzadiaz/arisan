"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Connection } from "@solana/web3.js";
import { useSolanaPoolData } from "@/hooks/use-solana-program";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { FetchedPool, FetchedMember, FetchedDraw, FetchedPayment } from "@/lib/solana/accounts";
import { PremiumCard, StatCard } from "@/components/ui/premium-card";
import { PremiumButton } from "@/components/ui/premium-button";
import { GradientText } from "@/components/ui/gradient-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import {
  Wallet,
  Users,
  TrendingUp,
  Clock,
  ArrowRight,
  PlusCircle,
  Trophy,
  Calendar,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface ActivityItem {
  type: "payment" | "winner" | "joined" | "draw";
  description: string;
  amount: string | null;
  time: string;
  poolName: string;
}

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const { hasWallet, walletAddress, walletPublicKey, isCustodial } = useWalletMode();
  const { getUserPools, getPoolMembers, getPoolPayments, getPoolDraws, isReady } = useSolanaPoolData();

  const [pools, setPools] = useState<FetchedPool[]>([]);
  const [memberData, setMemberData] = useState<Map<string, FetchedMember[]>>(new Map());
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Use the active wallet public key (web3 or custodial)
  const activePublicKey = walletPublicKey || publicKey;

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!activePublicKey) return;
    try {
      const balance = await connection.getBalance(activePublicKey);
      setWalletBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }, [connection, activePublicKey]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!isReady || !activePublicKey) {
      setLoading(false);
      return;
    }

    try {
      const userPools = await getUserPools();
      setPools(userPools);

      // Fetch members for each pool to determine user position
      const membersMap = new Map<string, FetchedMember[]>();
      const allActivity: ActivityItem[] = [];

      for (const pool of userPools) {
        const members = await getPoolMembers(pool.onChainAddress);
        membersMap.set(pool.id, members);

        // Fetch payments and draws for activity
        const payments = await getPoolPayments(pool.onChainAddress);
        const draws = await getPoolDraws(pool.onChainAddress);

        // Add payments to activity
        for (const payment of payments.slice(0, 3)) {
          const isYou = payment.walletAddress === walletAddress;
          allActivity.push({
            type: "payment",
            description: isYou
              ? `You made a payment to ${pool.name}`
              : `Payment received in ${pool.name}`,
            amount: `${payment.amount} ${pool.currency}`,
            time: formatTimeAgo(payment.paidAt!),
            poolName: pool.name,
          });
        }

        // Add draws to activity
        for (const draw of draws.slice(0, 2)) {
          const isWinner = draw.winnerAddress === walletAddress;
          allActivity.push({
            type: isWinner ? "winner" : "draw",
            description: isWinner
              ? `You won the draw in ${pool.name}!`
              : `Draw completed in ${pool.name}`,
            amount: isWinner ? `+${draw.amount} ${pool.currency}` : null,
            time: formatTimeAgo(draw.drawnAt),
            poolName: pool.name,
          });
        }
      }

      setMemberData(membersMap);

      // Sort activity by time and take top 5
      allActivity.sort((a, b) => {
        // Simple sort by "ago" text - this is approximation
        return 0;
      });
      setActivity(allActivity.slice(0, 5));
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [isReady, activePublicKey, walletAddress, getUserPools, getPoolMembers, getPoolPayments, getPoolDraws]);

  useEffect(() => {
    fetchBalance();
    fetchData();
  }, [fetchBalance, fetchData]);

  // Calculate stats
  const activePools = pools.filter(p => p.status === "active");
  const totalContributed = pools.reduce((sum, pool) => {
    const members = memberData.get(pool.id) || [];
    const myMember = members.find(m => m.walletAddress === walletAddress);
    if (myMember) {
      return sum + (pool.monthlyAmount * pool.currentRound);
    }
    return sum;
  }, 0);

  // Find next draw
  const nextDraw = activePools
    .filter(p => p.nextDrawDate)
    .sort((a, b) => a.nextDrawDate.getTime() - b.nextDrawDate.getTime())[0];

  const daysUntilNextDraw = nextDraw
    ? Math.max(0, Math.ceil((nextDraw.nextDrawDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Check if user has won in any pool
  const getUserPosition = (poolId: string) => {
    const members = memberData.get(poolId) || [];
    const myMember = members.find(m => m.walletAddress === walletAddress);
    return myMember?.position || 0;
  };

  const hasUserWon = (poolId: string) => {
    const members = memberData.get(poolId) || [];
    const myMember = members.find(m => m.walletAddress === walletAddress);
    return myMember?.hasWon || false;
  };

  // Not connected state (neither web3 nor custodial wallet)
  if (!hasWallet) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              <GradientText variant="default">Dashboard</GradientText>
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect a wallet or sign in to view your savings pools.
            </p>
          </div>
        </div>

        <Alert>
          <Wallet className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Connect a wallet or sign in to access your dashboard</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/auth">Sign In</Link>
              </Button>
              <Button size="sm" onClick={() => setVisible(true)}>
                Connect Wallet
              </Button>
            </div>
          </AlertDescription>
        </Alert>

        <PremiumCard beamEffect>
          <div className="p-12 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary mb-4">
              <Wallet className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Welcome to Arisan</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Connect your Solana wallet or sign in with email to create or join trustless rotating savings pools.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/auth">Sign In with Email</Link>
              </Button>
              <PremiumButton onClick={() => setVisible(true)}>
                Connect Wallet
              </PremiumButton>
            </div>
          </div>
        </PremiumCard>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-5 w-72 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            <GradientText variant="default">Dashboard</GradientText>
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here&apos;s an overview of your savings pools.
          </p>
        </div>
        <Link href="/pools/create">
          <PremiumButton className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Pool
          </PremiumButton>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Wallet Balance"
          value={`${walletBalance.toFixed(2)} SOL`}
          icon={Wallet}
        />
        <StatCard
          label="Active Pools"
          value={activePools.length.toString()}
          icon={Users}
        />
        <StatCard
          label="Total Contributed"
          value={`${totalContributed.toFixed(2)} SOL`}
          icon={TrendingUp}
        />
        <StatCard
          label="Next Draw"
          value={daysUntilNextDraw !== null ? `${daysUntilNextDraw} days` : "No draws"}
          icon={Clock}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active Pools */}
        <div className="lg:col-span-2">
          <PremiumCard>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Active Pools
                </h2>
                <Button variant="ghost" size="sm" asChild className="text-primary hover:bg-primary/10">
                  <Link href="/pools" className="gap-1">
                    View All
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="space-y-4">
                {activePools.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No active pools</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create or join a pool to get started.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" asChild>
                        <Link href="/pools/join">Join Pool</Link>
                      </Button>
                      <Button asChild>
                        <Link href="/pools/create">Create Pool</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  activePools.slice(0, 3).map((pool) => {
                    const members = memberData.get(pool.id) || [];
                    const daysUntil = Math.max(0, Math.ceil((pool.nextDrawDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

                    return (
                      <Link
                        key={pool.id}
                        href={`/pools/${pool.onChainAddress}`}
                        className="block"
                      >
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:bg-white/[0.05] hover:border-primary/30 transition-all duration-300 group">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold group-hover:text-primary transition-colors">{pool.name}</h3>
                                {hasUserWon(pool.id) && (
                                  <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
                                    <Trophy className="h-3 w-3" />
                                    Won
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {members.length}/{pool.maxMembers} members
                              </p>
                            </div>
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                              {pool.monthlyAmount} {pool.currency}/mo
                            </Badge>
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Round {pool.currentRound} of {pool.durationMonths}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Next draw: {daysUntil} days
                              </span>
                            </div>
                            <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all duration-500"
                                style={{ width: `${(pool.currentRound / pool.durationMonths) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </PremiumCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <PremiumCard>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
              <div className="space-y-4">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent activity
                  </p>
                ) : (
                  activity.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 pb-4 border-b border-white/[0.05] last:border-0 last:pb-0"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          item.type === "winner"
                            ? "bg-primary/20 text-primary"
                            : item.type === "payment"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-white/[0.05] text-muted-foreground"
                        }`}
                      >
                        {item.type === "winner" ? (
                          <Trophy className="h-5 w-5" />
                        ) : item.type === "payment" ? (
                          <Wallet className="h-5 w-5" />
                        ) : (
                          <Users className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{item.description}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {item.time}
                          </span>
                          {item.amount && (
                            <span
                              className={`text-sm font-semibold ${
                                item.amount.startsWith("+")
                                  ? "text-primary"
                                  : ""
                              }`}
                            >
                              {item.amount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PremiumCard>

          {/* Quick Actions */}
          <PremiumCard beamEffect>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/[0.08] bg-white/[0.02] hover:border-primary/50 hover:bg-primary/10"
                  asChild
                >
                  <Link href="/pools/create">
                    <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                    Create New Pool
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/[0.08] bg-white/[0.02] hover:border-primary/50 hover:bg-primary/10"
                  asChild
                >
                  <Link href="/pools/join">
                    <Users className="mr-2 h-4 w-4 text-primary" />
                    Join a Pool
                  </Link>
                </Button>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
