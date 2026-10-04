"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Dial } from "@/components/bezel/dial";
import { MiniDial } from "@/components/bezel/mini-dial";
import { Icon } from "@/components/bezel/icons";
import { EmptyState, Label, SkeletonDial } from "@/components/bezel/kit";
import { EMPTY_DIAL, dialFromPoolOnly, type DialSpec } from "@/components/bezel/dial-spec";
import { useSolanaPoolData } from "@/hooks/use-solana-program";
import type { FetchedPool } from "@/lib/solana/accounts";
import { formatAmount, timeUntil } from "@/lib/format";

// Signed out: the dial waits with its seats open.
const WELCOME_DIAL: DialSpec = { seats: 6, mode: "pending", staked: [0, 1, 2, 3, 4, 5], you: -1 };

export default function HomePage() {
  const { connected } = useWallet();

  return <AppShell>{connected ? <MyCircles /> : <Welcome />}</AppShell>;
}

function Welcome() {
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <Dial spec={WELCOME_DIAL} size={270} label="The Arisan dial: a gold coin in emerald glass" />
      <h2 className="bz-title mt-3">Savings circles on Solana</h2>
      <p className="bz-body mt-1.5">Pay in each round. Take the pot once.</p>
      <ConnectWalletButton className="mt-7" />
      <Link href="/join" className="bz-link mt-5 h-11">
        Join with code
      </Link>
    </div>
  );
}

function MyCircles() {
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

  const next = useMemo(
    () =>
      pools
        ?.filter((p) => p.status === "active")
        .sort((a, b) => a.nextDrawDate.getTime() - b.nextDrawDate.getTime())[0],
    [pools]
  );

  if (pools === null && loadFailed) {
    return (
      <EmptyState
        art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
        title="Can't reach Solana"
        action={
          <button
            onClick={() => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="bz-button bz-button-ghost"
          >
            <Icon name="refresh" className="size-[18px]" />
            Try again
          </button>
        }
      >
        Check your connection.
      </EmptyState>
    );
  }

  if (pools === null) {
    return (
      <div aria-busy="true" aria-label="Loading your circles">
        <SkeletonDial size={270} />
        <div className="mt-4 flex flex-col items-center gap-2.5">
          <div className="bz-skel h-2.5 w-40 rounded-full" />
          <div className="bz-skel h-6 w-52 rounded-lg" />
        </div>
        <div className="bz-skel mt-6 h-[52px] rounded-[26px]" />
        <div className="bz-skel mt-6 h-12 rounded-xl" />
        <div className="bz-skel mt-2.5 h-12 rounded-xl" />
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <EmptyState
        art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
        title="No circles yet"
        action={
          <>
            <Link href="/pools/create" className="bz-button bz-button-gold">
              Create circle
            </Link>
            <Link href="/join" className="bz-button bz-button-ghost">
              Join with code
            </Link>
          </>
        }
      >
        Start one and invite people, or join with a code.
      </EmptyState>
    );
  }

  const drawIn = next ? timeUntil(next.nextDrawDate) : null;

  return (
    <div>
      {next && (
        <div className="flex flex-col items-center text-center">
          <Dial spec={dialFromPoolOnly(next)} size={270} label={`${next.name}, round ${next.currentRound} of ${next.durationMonths}`} />
          <Label className="mt-1.5">
            {next.name} · Round {next.currentRound}/{next.durationMonths}
          </Label>
          <p className="bz-display mt-1.5">{drawIn ? `Draw in ${drawIn}` : "Draw due"}</p>
          <Link href={`/pools/${next.id}`} className="bz-button bz-button-gold mt-5">
            Open circle
          </Link>
        </div>
      )}

      <section className={next ? "mt-7" : ""}>
        <div className="mb-1 flex items-center justify-between px-0.5">
          <h2 className="bz-label">Circles</h2>
          <span className="bz-label">{pools.length}</span>
        </div>
        <ul className="divide-y divide-border">
          {pools.map((pool) => (
            <li key={pool.id}>
              <Link href={`/pools/${pool.id}`} className="grid h-[64px] grid-cols-[44px_minmax(0,1fr)_auto_16px] items-center gap-3 active:opacity-70">
                <MiniDial spec={dialFromPoolOnly(pool)} className="size-11" />
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-medium">{pool.name}</span>
                  <span className="mt-0.5 block font-mono text-[12.5px] text-muted-foreground tabular-nums">
                    {formatAmount(pool.monthlyAmount, pool.currency)} · {pool.status === "active" ? `R${pool.currentRound}/${pool.durationMonths}` : `${pool.maxMembers} seats`}
                  </span>
                </span>
                <StatusPill status={pool.status} />
                <Icon name="chev" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
