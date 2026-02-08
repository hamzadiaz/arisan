"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSolanaPoolData } from "@/hooks/use-solana-program";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { FetchedPool, FetchedMember } from "@/lib/solana/accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import {
  PlusCircle,
  Search,
  Users,
  Calendar,
  Trophy,
  Clock,
  ArrowRight,
  Wallet,
  RefreshCw,
} from "lucide-react";

interface PoolWithMembers extends FetchedPool {
  members: FetchedMember[];
  userPosition?: number;
  hasUserWon?: boolean;
}

// Helper to format amounts with appropriate decimal places
const formatAmount = (amount: number | undefined, currency?: string): string => {
  if (amount === undefined || amount === null) return "0";
  const decimals = currency === "SOL" ? 4 : 2;
  return parseFloat(amount.toFixed(decimals)).toString();
};

function PoolCard({ pool }: { pool: PoolWithMembers }) {
  const isCompleted = pool.status === "completed";
  const daysUntilDraw = Math.max(0, Math.ceil((pool.nextDrawDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <Link href={`/pools/${pool.onChainAddress}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{pool.name}</CardTitle>
                {pool.hasUserWon && (
                  <Badge variant="secondary" className="gap-1">
                    <Trophy className="h-3 w-3" />
                    Won
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                {pool.onChainAddress.slice(0, 8)}...{pool.onChainAddress.slice(-8)}
              </p>
            </div>
            <Badge variant={isCompleted ? "secondary" : pool.status === "pending" ? "outline" : "default"}>
              {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Members</p>
                <p className="font-medium flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {pool.members.length}/{pool.maxMembers}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Monthly</p>
                <p className="font-medium">{formatAmount(pool.monthlyAmount, pool.currency)} {pool.currency}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Your Position</p>
                <p className="font-medium">#{pool.userPosition || "-"}</p>
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  Round {pool.currentRound} of {pool.durationMonths}
                </span>
                {!isCompleted && pool.status === "active" && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {daysUntilDraw} days
                  </span>
                )}
              </div>
              <Progress
                value={(pool.currentRound / pool.durationMonths) * 100}
                className="h-2"
              />
            </div>

            {/* View button */}
            <Button variant="ghost" className="w-full justify-between" size="sm">
              View Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PoolSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PoolsPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { getUserPools, getPoolMembers, isReady } = useSolanaPoolData();
  const { hasWallet, walletAddress, walletPublicKey } = useWalletMode();

  // Use either web3 or custodial public key
  const activePublicKey = walletPublicKey || publicKey;

  const [pools, setPools] = useState<PoolWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPools = useCallback(async () => {
    if (!isReady || !activePublicKey) {
      setLoading(false);
      return;
    }

    try {
      const userPools = await getUserPools();

      // Fetch members for each pool
      const poolsWithMembers: PoolWithMembers[] = await Promise.all(
        userPools.map(async (pool) => {
          const members = await getPoolMembers(pool.onChainAddress);
          const userMember = members.find(m => m.walletAddress === walletAddress);

          return {
            ...pool,
            members,
            userPosition: userMember?.position,
            hasUserWon: userMember?.hasWon,
          };
        })
      );

      setPools(poolsWithMembers);
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isReady, activePublicKey, walletAddress, getUserPools, getPoolMembers]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPools();
  };

  // Filter pools by search
  const filteredPools = pools.filter(pool =>
    pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pool.onChainAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pool.inviteCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activePools = filteredPools.filter((p) => p.status === "active");
  const pendingPools = filteredPools.filter((p) => p.status === "pending");
  const completedPools = filteredPools.filter((p) => p.status === "completed");

  // Not connected state (no web3 wallet and no custodial wallet)
  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Pools</h1>
            <p className="text-muted-foreground">
              Connect your wallet or sign in to view your pools.
            </p>
          </div>
        </div>

        <Alert>
          <Wallet className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span>Connect your wallet or sign in to view and manage your pools</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setVisible(true)}>
                Connect Wallet
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/auth">Sign In</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>

        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary mb-4">
              <Wallet className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Get Started</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Connect your Solana wallet or sign in with email to create or join trustless rotating savings pools.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setVisible(true)}>
                Connect Wallet
              </Button>
              <Button variant="outline" asChild>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Pools</h1>
          <p className="text-muted-foreground">
            Manage your savings pools and track your progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pools/join">Join Pool</Link>
          </Button>
          <Button asChild>
            <Link href="/pools/create" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Create Pool
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search pools by name, address, or invite code..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <PoolSkeleton key={i} />
          ))}
        </div>
      ) : (
        /* Tabs */
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              Active
              <Badge variant="secondary" className="ml-1">
                {activePools.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              Pending
              <Badge variant="secondary" className="ml-1">
                {pendingPools.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              Completed
              <Badge variant="secondary" className="ml-1">
                {completedPools.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="all">All ({filteredPools.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            {activePools.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activePools.map((pool) => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No active pools</h3>
                  <p className="text-muted-foreground mb-4">
                    You&apos;re not part of any active pools yet.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/pools/join">Join a Pool</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/pools/create">Create Pool</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            {pendingPools.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pendingPools.map((pool) => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No pending pools</h3>
                  <p className="text-muted-foreground">
                    Pools waiting for members to join will appear here.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {completedPools.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedPools.map((pool) => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No completed pools</h3>
                  <p className="text-muted-foreground">
                    You haven&apos;t completed any pools yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            {filteredPools.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPools.map((pool) => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No pools found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery
                      ? "No pools match your search criteria."
                      : "You haven't joined or created any pools yet."}
                  </p>
                  {!searchQuery && (
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" asChild>
                        <Link href="/pools/join">Join a Pool</Link>
                      </Button>
                      <Button asChild>
                        <Link href="/pools/create">Create Pool</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
