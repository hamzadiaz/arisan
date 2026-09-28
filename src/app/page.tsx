"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronRight } from "lucide-react";
import { AppShell, RoundBar, Section, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Art } from "@/components/mobile/art";
import { ASSETS } from "@/lib/assets";
import { useSolanaPoolData } from "@/hooks/use-solana-program";
import type { FetchedPool } from "@/lib/solana/accounts";
import { formatAmount, timeUntil } from "@/lib/format";

export default function HomePage() {
  const { connected } = useWallet();

  return (
    <AppShell>
      {connected ? <MyPools /> : <Welcome />}
    </AppShell>
  );
}

function Welcome() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col justify-end gap-3 pb-2">
      <div className="mb-auto pt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Savings circles on Solana</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">Pay in each round. Take the pot once.</p>
      </div>
      <ConnectWalletButton />
      <Link
        href="/join"
        className="flex h-11 w-full items-center justify-center text-sm font-medium text-muted-foreground active:text-foreground"
      >
        Join with code
      </Link>
    </div>
  );
}

function MyPools() {
  const { getUserPools } = useSolanaPoolData();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<FetchedPool[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUserPools().then(
      (result) => {
        if (cancelled) return;
        setPools(result);
        setLoadFailed(false);
      },
      (error) => {
        if (cancelled) return;
        console.error("Failed to load pools:", error);
        setLoadFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [getUserPools, publicKey, attempt]);

  const nextDue = useMemo(
    () =>
      pools
        ?.filter((p) => p.status === "active")
        .sort((a, b) => a.nextDrawDate.getTime() - b.nextDrawDate.getTime())[0],
    [pools]
  );

  return (
    <div>
      {nextDue && (
        <Link
          href={`/pools/${nextDue.id}`}
          className="mb-5 block rounded-xl border border-border bg-card p-4 active:opacity-80"
        >
          <div className="flex items-center justify-between text-[13px] text-muted-foreground">
            <span className="truncate">Next draw · {nextDue.name}</span>
            <span className="shrink-0 font-medium text-primary">
              {timeUntil(nextDue.nextDrawDate) ? `in ${timeUntil(nextDue.nextDrawDate)}` : "Due now"}
            </span>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatAmount(nextDue.monthlyAmount, nextDue.currency)}
          </p>
          <RoundBar round={nextDue.currentRound} total={nextDue.durationMonths} />
        </Link>
      )}

      <Section title="Pools">
        {pools === null && loadFailed ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm">Can&apos;t reach Solana</p>
            <button
              onClick={() => {
                setLoadFailed(false);
                setAttempt((n) => n + 1);
              }}
              className="h-9 rounded-lg px-3 text-sm font-medium text-primary active:bg-muted"
            >
              Try again
            </button>
          </div>
        ) : pools === null ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : pools.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Art src={ASSETS.emptyPools} className="size-28" />
            <p className="mt-2 text-sm text-muted-foreground">No pools yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {pools.map((pool) => (
              <li key={pool.id}>
                <Link
                  href={`/pools/${pool.id}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{pool.name}</p>
                    <p className="text-[13px] text-muted-foreground tabular-nums">
                      {formatAmount(pool.monthlyAmount, pool.currency)} · {pool.maxMembers} members
                    </p>
                  </div>
                  <StatusPill status={pool.status} />
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
