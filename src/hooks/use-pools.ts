"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  getUserPools,
  getPool,
  getPoolMembers,
  getPoolPayments,
  getPoolDraws,
  createPool,
  joinPool,
  leavePool,
  startPool,
  getPoolByInviteCode,
  subscribeToPool,
  subscribeToPoolMembers,
  subscribeToUserPools,
} from "@/lib/pools";
import { Pool, PoolMember, Payment, Draw } from "@/types";

// Hook to get user's pools with real-time updates
export function useUserPools() {
  const { user } = useAuth();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setPools([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToUserPools(user.id, (userPools) => {
      setPools(userPools);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.id]);

  const refetch = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const userPools = await getUserPools(user.id);
      setPools(userPools);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  return { pools, isLoading, error, refetch };
}

// Hook to get a single pool with real-time updates
export function usePool(poolId: string) {
  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!poolId) {
      setPool(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToPool(poolId, (poolData) => {
      setPool(poolData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [poolId]);

  return { pool, isLoading, error };
}

// Hook to get pool members with real-time updates
export function usePoolMembers(poolId: string) {
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!poolId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToPoolMembers(poolId, (poolMembers) => {
      setMembers(poolMembers);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [poolId]);

  return { members, isLoading, error };
}

// Hook to get pool payments
export function usePoolPayments(poolId: string, round?: number) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!poolId) {
      setPayments([]);
      setIsLoading(false);
      return;
    }

    const fetchPayments = async () => {
      setIsLoading(true);
      try {
        const poolPayments = await getPoolPayments(poolId, round);
        setPayments(poolPayments);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayments();
  }, [poolId, round]);

  return { payments, isLoading, error };
}

// Hook to get pool draws
export function usePoolDraws(poolId: string) {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!poolId) {
      setDraws([]);
      setIsLoading(false);
      return;
    }

    const fetchDraws = async () => {
      setIsLoading(true);
      try {
        const poolDraws = await getPoolDraws(poolId);
        setDraws(poolDraws);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDraws();
  }, [poolId]);

  return { draws, isLoading, error };
}

// Hook for pool actions
export function usePoolActions() {
  const { user, walletAddress } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: {
      name: string;
      description?: string;
      maxMembers: number;
      monthlyAmount: number;
      currency: "SOL" | "USDC" | "USDT";
      durationMonths: number;
    }) => {
      if (!user?.id) throw new Error("Must be authenticated");

      setIsLoading(true);
      setError(null);

      try {
        const poolId = await createPool({
          ...data,
          creatorId: user.id,
          nextDrawDate: new Date(),
        });

        // Auto-join the creator as first member
        if (walletAddress) {
          await joinPool(poolId, user.id, walletAddress);
        }

        return poolId;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, walletAddress]
  );

  const join = useCallback(
    async (poolIdOrInviteCode: string) => {
      if (!user?.id || !walletAddress) {
        throw new Error("Must be authenticated with wallet connected");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Check if it's an invite code or pool ID
        let poolId = poolIdOrInviteCode;
        if (poolIdOrInviteCode.length === 8) {
          const pool = await getPoolByInviteCode(poolIdOrInviteCode);
          if (!pool) throw new Error("Invalid invite code");
          poolId = pool.id;
        }

        await joinPool(poolId, user.id, walletAddress);
        return poolId;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, walletAddress]
  );

  const leave = useCallback(
    async (poolId: string) => {
      if (!user?.id) throw new Error("Must be authenticated");

      setIsLoading(true);
      setError(null);

      try {
        await leavePool(poolId, user.id);
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id]
  );

  const start = useCallback(async (poolId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await startPool(poolId);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    create,
    join,
    leave,
    start,
    isLoading,
    error,
  };
}

// Hook to get pool stats
export function usePoolStats() {
  const { pools, isLoading } = useUserPools();

  const stats = {
    totalPools: pools.length,
    activePools: pools.filter((p) => p.status === "active").length,
    completedPools: pools.filter((p) => p.status === "completed").length,
    pendingPools: pools.filter((p) => p.status === "pending").length,
    totalContributed: 0, // Would need to calculate from payments
    upcomingDraws: pools
      .filter((p) => p.status === "active")
      .sort((a, b) => a.nextDrawDate.getTime() - b.nextDrawDate.getTime()),
  };

  return { stats, isLoading };
}
