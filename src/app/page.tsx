"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronRight, Plus, ShieldCheck, Ticket, Users, Repeat, Trophy } from "lucide-react";
import { AppShell, Panel, Section, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
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
    <div className="flex flex-col gap-6 pt-4">
      <div className="space-y-3">
        <h2 className="text-[2rem] font-bold leading-tight tracking-tight">
          Save together.
          <br />
          <span className="text-primary">Take turns.</span>
        </h2>
        <p className="text-base text-muted-foreground">
          A savings circle with friends on Solana. Everyone pays in each round; one member
          takes the pot.
        </p>
      </div>

      <Panel className="space-y-4">
        {[
          { icon: Users, title: "Start a circle", body: "2–20 people, paid in SOL" },
          { icon: Repeat, title: "Pay each round", body: "Same amount, straight from your wallet" },
          { icon: Trophy, title: "One member takes the pot", body: "Everyone wins exactly once" },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight">{title}</p>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </Panel>

      <div className="space-y-3">
        <ConnectWalletButton />
        <Link
          href="/join"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-primary active:bg-muted"
        >
          <Ticket className="size-4" />
          Have an invite code?
        </Link>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Your keys, your wallet · Seed Vault, Phantom, Solflare
      </p>
    </div>
  );
}

function MyPools() {
  const { getUserPools } = useSolanaPoolData();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<FetchedPool[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserPools().then((result) => {
      if (!cancelled) setPools(result);
    });
    return () => {
      cancelled = true;
    };
  }, [getUserPools, publicKey]);

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
        <Link href={`/pools/${nextDue.id}`} className="block">
          <div className="mb-6 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-xl shadow-emerald-900/20">
            <p className="text-sm font-medium text-emerald-100">Next draw · {nextDue.name}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight">
              {formatAmount(nextDue.monthlyAmount, nextDue.currency)}
            </p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-white/20 px-3 py-1 font-medium">
                Round {nextDue.currentRound} of {nextDue.durationMonths}
              </span>
              <span className="font-medium">
                {timeUntil(nextDue.nextDrawDate) ? `In ${timeUntil(nextDue.nextDrawDate)}` : "Due now"}
              </span>
            </div>
          </div>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/pools/create"
          className="flex h-24 flex-col items-start justify-between rounded-2xl bg-primary p-4 font-semibold text-primary-foreground active:scale-[0.98] transition-transform"
        >
          <Plus className="size-6" />
          Create pool
        </Link>
        <Link
          href="/join"
          className="flex h-24 flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 font-semibold active:scale-[0.98] transition-transform"
        >
          <Ticket className="size-6 text-primary" />
          Join with code
        </Link>
      </div>

      <Section title="My pools">
        {pools === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : pools.length === 0 ? (
          <Panel className="py-8 text-center">
            <p className="font-semibold">No pools yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one and share the code, or join with a code from a friend.
            </p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {pools.map((pool) => (
              <li key={pool.id}>
                <Link
                  href={`/pools/${pool.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{pool.name}</p>
                      <StatusPill status={pool.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatAmount(pool.monthlyAmount, pool.currency)} / round ·{" "}
                      {pool.maxMembers} members
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
