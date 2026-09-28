"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Check, Crown, ExternalLink, RefreshCw } from "lucide-react";
import { AppShell, Panel, PrimaryButton, RoundBar, Section, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { parsePublicKey, useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
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
  const [loadFailed, setLoadFailed] = useState(false);
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

  const load = useCallback(async () => {
    try {
      setData(await fetchData());
      setLoadFailed(false);
    } catch (error) {
      console.error("Failed to load pool:", error);
      setLoadFailed(true);
    }
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;
    fetchData().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setLoadFailed(false);
      },
      (error) => {
        if (cancelled) return;
        console.error("Failed to load pool:", error);
        setLoadFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  // Live updates when the pool account changes on-chain
  useEffect(() => {
    const address = parsePublicKey(poolId);
    // A malformed address has nothing to watch; the page renders "not found"
    const id = address ? connection.onAccountChange(address, () => load(), "confirmed") : null;
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

  if (!data && loadFailed) {
    return (
      <AppShell title="Pool" back>
        <div className="py-16 text-center">
          <p className="font-medium">Can&apos;t reach Solana</p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary active:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Pool" back>
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-12 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  const { pool, members, payments, draws } = data;

  if (!pool) {
    return (
      <AppShell title="Pool" back>
        <div className="py-16 text-center">
          <p className="font-medium">Pool not found</p>
          <Link href="/" className="mt-3 inline-block text-sm font-medium text-primary">
            Go home
          </Link>
        </div>
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
  const stakePool = pool.stakeEnabled !== false;
  const needsStake = stakePool && myMember && !myMember.stakeDeposited;
  // start_pool does not check stakes on-chain; an unstaked member of a started pool can
  // neither stake nor pay. Only offer Start once everyone has staked.
  const staked = stakePool ? members.filter((m) => m.stakeDeposited).length : members.length;

  let primary: React.ReactNode = null;
  if (!connected) {
    primary = <ConnectWalletButton />;
  } else if (unclaimedWin) {
    primary = (
      <PrimaryButton onClick={() => claim(unclaimedWin)} disabled={busy}>
        Claim {formatAmount(unclaimedWin.amount, pool.currency)}
      </PrimaryButton>
    );
  } else if (!myMember && pool.status === "pending") {
    primary = (
      <Link
        href="/join"
        className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        Join with code
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
      <PrimaryButton onClick={start} disabled={busy || members.length < 2 || staked < members.length}>
        {members.length < 2
          ? "Waiting for members"
          : staked < members.length
            ? `Waiting for stakes (${staked}/${members.length})`
            : busy
              ? "Confirm in wallet…"
              : `Start with ${members.length} members`}
      </PrimaryButton>
    );
  } else if (myMember?.isKicked) {
    primary = <PrimaryButton disabled>You were removed from this pool</PrimaryButton>;
  } else if (myMember && pool.status === "active" && needsStake && myMember.inGracePeriod) {
    // Slashed for a missed round: the program requires a fresh stake before paying again
    primary = (
      <PrimaryButton onClick={stake} disabled={busy}>
        {busy ? "Confirm in wallet…" : "Restake to stay in"}
      </PrimaryButton>
    );
  } else if (myMember && pool.status === "active" && needsStake) {
    primary = <PrimaryButton disabled>No stake deposited · payments are blocked</PrimaryButton>;
  } else if (myMember && pool.status === "active") {
    primary = paidThisRound.has(me!) ? (
      <PrimaryButton disabled>
        <Check className="size-4" />
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
      <Panel className="mb-3">
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span>
            {pool.status === "active"
              ? drawIn
                ? `Draw in ${drawIn}`
                : "Draw due"
              : pool.status === "pending"
                ? `${members.length} of ${pool.maxMembers} joined`
                : "Completed"}
          </span>
          <button
            onClick={refresh}
            className="-m-2 flex size-9 items-center justify-center rounded-full active:bg-muted"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </button>
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatAmount(pot, pool.currency)}</p>
        <p className="text-[13px] text-muted-foreground">
          pot · {formatAmount(pool.monthlyAmount, pool.currency)} / round
        </p>
        {pool.status === "active" && <RoundBar round={pool.currentRound} total={pool.durationMonths} />}
      </Panel>

      {primary && <div className={pool.status === "active" ? "mb-2" : "mb-5"}>{primary}</div>}

      {pool.status === "active" && (
        <p className="mb-5 text-center text-[13px] text-muted-foreground tabular-nums">
          {paidThisRound.size}/{members.length} paid this round
        </p>
      )}

      {draws.length > 0 && (
        <Section title="Winners">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {[...draws].reverse().map((d) => (
              <li key={d.id}>
                <a
                  href={addressExplorerLink(d.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 active:bg-muted"
                >
                  <span className="w-7 text-[13px] text-muted-foreground tabular-nums">#{d.round}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm">
                      {d.winnerAddress === me ? "You" : shortAddress(d.winnerAddress)}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{d.drawnAt.toLocaleDateString()}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatAmount(d.amount, pool.currency)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Members · ${members.length}/${pool.maxMembers}`}>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {members
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((m) => {
              const paid = paidThisRound.has(m.walletAddress);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold">
                    {m.walletAddress.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="font-mono text-sm">
                        {m.walletAddress === me ? "You" : shortAddress(m.walletAddress)}
                      </span>
                      {m.walletAddress === pool.creatorId && <Crown className="size-3.5 text-amber-500" />}
                    </p>
                    {memberNote(m, pool) && (
                      <p className="text-xs text-muted-foreground">{memberNote(m, pool)}</p>
                    )}
                  </div>
                  {pool.status === "active" && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        paid ? "bg-primary/15 text-emerald-700 dark:text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {paid ? "Paid" : "Due"}
                    </span>
                  )}
                </li>
              );
            })}
          {Array.from({ length: Math.max(0, pool.maxMembers - members.length) }).map((_, i) => (
            <li key={`open-${i}`} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
              <span className="size-8 rounded-full border border-dashed border-border" />
              <span className="text-sm">Open</span>
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
          Explorer
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </AppShell>
  );
}

function memberNote(m: FetchedMember, pool: FetchedPool): string | null {
  if (m.hasWon) return `Won round ${m.wonRound}`;
  if (pool.status === "pending" && pool.stakeEnabled !== false && !m.stakeDeposited) return "Stake pending";
  if (m.inDefault) return "Missed a payment";
  return null;
}
