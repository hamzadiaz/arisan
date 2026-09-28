"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Check, Clock, Crown, ExternalLink, RefreshCw, Trophy } from "lucide-react";
import { AppShell, Panel, PrimaryButton, Section, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { addressExplorerLink, formatAmount, shortAddress, timeUntil } from "@/lib/format";
import { dismissToast, poolToasts, txErrorToast } from "@/lib/solana/transaction-toast";
import { cn } from "@/lib/utils";

interface PoolData {
  pool: FetchedPool | null;
  members: FetchedMember[];
  payments: FetchedPayment[];
  draws: FetchedDraw[];
}

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poolId } = use(params);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { getPool, getPoolMembers, getPoolPayments, getPoolDraws } = useSolanaPoolData();
  const actions = useSolanaPoolActions();

  const [data, setData] = useState<PoolData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);

  const fetchData = useCallback(async (): Promise<PoolData> => {
    const [pool, members, payments, draws] = await Promise.all([
      getPool(poolId),
      getPoolMembers(poolId),
      getPoolPayments(poolId),
      getPoolDraws(poolId),
    ]);
    return { pool, members, payments, draws };
  }, [poolId, getPool, getPoolMembers, getPoolPayments, getPoolDraws]);

  const load = useCallback(async () => setData(await fetchData()), [fetchData]);

  useEffect(() => {
    let cancelled = false;
    fetchData().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  // Live updates when the pool account changes on-chain
  useEffect(() => {
    let id: number | null = null;
    try {
      id = connection.onAccountChange(new PublicKey(poolId), () => load(), "confirmed");
    } catch {
      // Invalid pool address; the page renders "not found"
    }
    return () => {
      if (id !== null) connection.removeAccountChangeListener(id);
    };
  }, [connection, poolId, load]);

  // Re-render every 30s so the countdown stays current
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <AppShell title="Pool" back>
        <div className="space-y-3">
          <div className="h-48 animate-pulse rounded-3xl bg-muted" />
          <div className="h-14 animate-pulse rounded-2xl bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  const { pool, members, payments, draws } = data;

  if (!pool) {
    return (
      <AppShell title="Pool" back>
        <Panel className="py-10 text-center">
          <p className="font-semibold">Pool not found</p>
          <p className="mt-1 text-sm text-muted-foreground">Check the link and your network.</p>
          <Link href="/" className="mt-4 inline-block font-semibold text-primary">
            Go home
          </Link>
        </Panel>
      </AppShell>
    );
  }

  const me = publicKey?.toBase58();
  const myMember = members.find((m) => m.walletAddress === me);
  const isAuthority = me === pool.creatorId;
  const paidThisRound = new Set(
    payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress)
  );
  const unclaimedWin = draws.find((d) => d.winnerAddress === me && !d.claimed);
  const drawIn = timeUntil(pool.nextDrawDate);
  const pot = pool.monthlyAmount * (pool.status === "pending" ? pool.maxMembers : members.length);
  const poolKey = new PublicKey(pool.onChainAddress);

  const run = async (
    start: () => string | number,
    tx: () => Promise<{ success: boolean; signature?: string; error?: string }>,
    done: (signature: string) => void
  ) => {
    const toastId = start();
    const result = await tx();
    dismissToast(toastId);
    if (result.success) {
      done(result.signature!);
      await load();
    } else {
      txErrorToast(result.error || "Transaction failed");
    }
  };

  const pay = () =>
    run(
      poolToasts.makingPayment,
      () => actions.makePayment({ poolAddress: poolKey, round: pool.currentRound }),
      (sig) => poolToasts.paymentMade(sig, pool.monthlyAmount, pool.currency, pool.currentRound)
    );
  const stake = () =>
    run(
      poolToasts.depositingStake,
      () => actions.depositStake({ poolAddress: poolKey }),
      (sig) => poolToasts.stakeDeposited(sig, myMember?.stakeAmount ?? pool.monthlyAmount, pool.currency)
    );
  const start = () =>
    run(poolToasts.startingPool, () => actions.startPool({ poolAddress: poolKey }), poolToasts.poolStarted);
  const claim = (d: FetchedDraw) =>
    run(
      poolToasts.claimingWinnings,
      () => actions.claimWinnings({ poolAddress: poolKey, round: d.round }),
      (sig) => poolToasts.winningsClaimed(sig, d.amount, pool.currency)
    );

  const busy = actions.isLoading;
  const needsStake = pool.stakeEnabled !== false && myMember && !myMember.stakeDeposited;

  let primary: React.ReactNode = null;
  if (!connected) {
    primary = <ConnectWalletButton />;
  } else if (unclaimedWin) {
    primary = (
      <PrimaryButton onClick={() => claim(unclaimedWin)} disabled={busy}>
        <Trophy className="size-5" />
        Claim {formatAmount(unclaimedWin.amount, pool.currency)}
      </PrimaryButton>
    );
  } else if (!myMember && pool.status === "pending") {
    primary = (
      <Link
        href="/join"
        className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary font-semibold text-primary-foreground"
      >
        Join with invite code
      </Link>
    );
  } else if (needsStake && pool.status === "pending") {
    primary = (
      <PrimaryButton onClick={stake} disabled={busy}>
        {busy ? "Confirm in wallet…" : "Deposit stake"}
      </PrimaryButton>
    );
  } else if (isAuthority && pool.status === "pending") {
    primary = (
      <PrimaryButton onClick={start} disabled={busy || members.length < 2}>
        {members.length < 2 ? "Waiting for members" : busy ? "Confirm in wallet…" : `Start with ${members.length} members`}
      </PrimaryButton>
    );
  } else if (myMember && pool.status === "active") {
    primary = paidThisRound.has(me!) ? (
      <PrimaryButton disabled>
        <Check className="size-5" />
        Paid for round {pool.currentRound}
      </PrimaryButton>
    ) : (
      <PrimaryButton onClick={pay} disabled={busy}>
        {busy ? "Confirm in wallet…" : `Pay ${formatAmount(pool.monthlyAmount, pool.currency)}`}
      </PrimaryButton>
    );
  }

  return (
    <AppShell title={pool.name} back>
      <div className="mb-4 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-xl shadow-emerald-900/20">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
            {pool.status === "active"
              ? `Round ${pool.currentRound} of ${pool.durationMonths}`
              : pool.status === "pending"
                ? `${members.length} of ${pool.maxMembers} joined`
                : "Completed"}
          </span>
          <button
            onClick={refresh}
            className="flex size-9 items-center justify-center rounded-full bg-white/15 active:scale-95"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </button>
        </div>
        <p className="mt-4 text-sm text-emerald-100">Pot</p>
        <p className="text-4xl font-bold tracking-tight">{formatAmount(pot, pool.currency)}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>{formatAmount(pool.monthlyAmount, pool.currency)} / round</span>
          {pool.status === "active" && (
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="size-4" />
              {drawIn ? `Draw in ${drawIn}` : "Draw due"}
            </span>
          )}
        </div>
      </div>

      {primary && <div className="mb-6">{primary}</div>}

      {pool.status === "active" && (
        <p className="-mt-3 mb-6 px-1 text-center text-xs text-muted-foreground">
          {paidThisRound.size} of {members.length} paid this round · the draw runs after the round
          deadline and pays the winner from the vault
        </p>
      )}

      {draws.length > 0 && (
        <Section title="Winners">
          <ul className="space-y-2">
            {[...draws].reverse().map((d) => (
              <li key={d.id}>
                <a
                  href={addressExplorerLink(d.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-300">
                    <Trophy className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Round {d.round} · {d.winnerAddress === me ? "You" : shortAddress(d.winnerAddress)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatAmount(d.amount, pool.currency)} · {d.drawnAt.toLocaleDateString()}
                    </p>
                  </div>
                  <ExternalLink className="size-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Members · ${members.length}/${pool.maxMembers}`}>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {members
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((m) => {
              const paid = paidThisRound.has(m.walletAddress);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold">
                    {m.walletAddress.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      <span className="font-mono text-sm">
                        {m.walletAddress === me ? "You" : shortAddress(m.walletAddress)}
                      </span>
                      {m.walletAddress === pool.creatorId && <Crown className="size-3.5 text-amber-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.hasWon
                        ? `Won round ${m.wonRound}`
                        : pool.status === "pending" && pool.stakeEnabled !== false && !m.stakeDeposited
                          ? "Stake pending"
                          : m.inDefault
                            ? "Missed a payment"
                            : "Waiting for their turn"}
                    </p>
                  </div>
                  {pool.status === "active" && (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        paid ? "bg-primary/15 text-emerald-700 dark:text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {paid ? "Paid" : "Due"}
                    </span>
                  )}
                  {m.hasWon && <Trophy className="size-4 text-amber-500" />}
                </li>
              );
            })}
          {Array.from({ length: Math.max(0, pool.maxMembers - members.length) }).map((_, i) => (
            <li key={`open-${i}`} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
              <span className="size-9 rounded-full border-2 border-dashed border-border" />
              <span className="text-sm">Open seat</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <StatusPill status={pool.status} />
        <a
          href={addressExplorerLink(pool.onChainAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-medium"
        >
          View on explorer
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </AppShell>
  );
}
