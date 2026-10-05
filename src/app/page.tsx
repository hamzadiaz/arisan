"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Dial } from "@/components/bezel/dial";
import { MiniDial } from "@/components/bezel/mini-dial";
import { Icon } from "@/components/bezel/icons";
import { Button, EmptyState, Label, LowFunds, SkeletonDial, Status } from "@/components/bezel/kit";
import { EMPTY_DIAL, dialFromPool, dialFromPoolOnly, type DialSpec } from "@/components/bezel/dial-spec";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useBalance } from "@/hooks/use-balance";
import type { FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { circleAction, circleFacts } from "@/lib/circle-state";
import { PROGRAM_ID, getPaymentPDA } from "@/lib/solana/program";
import { formatAmount, timeUntil } from "@/lib/format";
import { dismissToast, poolToasts, txErrorToast } from "@/lib/solana/transaction-toast";

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
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<FetchedPool[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Circles where you've paid this round: one read for every active circle's payment PDA
  const [paid, setPaid] = useState<Set<string> | null>(null);

  useEffect(() => {
    const active = pools?.filter((p) => p.status === "active") ?? [];
    if (!publicKey || active.length === 0) return;
    let cancelled = false;
    const pdas = active.map((p) => getPaymentPDA(new PublicKey(p.onChainAddress), publicKey, p.currentRound)[0]);
    connection.getMultipleAccountsInfo(pdas, "confirmed").then(
      // Only a real Payment account counts: anyone can send lamports to the address
      (infos) =>
        !cancelled &&
        setPaid(new Set(active.filter((_, i) => !!infos[i] && infos[i]!.owner.equals(PROGRAM_ID) && infos[i]!.data.length > 0).map((p) => p.id))),
      () => undefined // rows fall back to the circle's own status
    );
    return () => {
      cancelled = true;
    };
  }, [pools, publicKey, connection]);

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
        art={<Dial spec={EMPTY_DIAL} size={220} />}
        title="Can’t reach Solana"
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
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading your circles</span>
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
        art={<Dial spec={EMPTY_DIAL} size={220} />}
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

  return (
    <div>
      {next && <NextCircle key={next.id} pool={next} />}

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
                {pool.status === "active" && paid ? (
                  <Status tone={paid.has(pool.id) ? "paid" : "due"} strong={!paid.has(pool.id)}>
                    {paid.has(pool.id) ? "Paid" : "Due"}
                  </Status>
                ) : (
                  <StatusPill status={pool.status} />
                )}
                <Icon name="chev" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// The circle whose draw comes next: its seats on the dial, and the one thing to do in it.
function NextCircle({ pool: listed }: { pool: FetchedPool }) {
  const { getPool, getPoolMembers, getPoolPayments } = useSolanaPoolData();
  const { makePayment, isLoading } = useSolanaPoolActions();
  const { publicKey, connected } = useWallet();
  const balance = useBalance();
  // undefined while loading, null if the read failed (the hero then shows the circle only)
  const [detail, setDetail] = useState<
    { pool: FetchedPool; members: FetchedMember[]; payments: FetchedPayment[] } | null | undefined
  >(undefined);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    // The list was read once; the round may have moved since. Pay against the pool as it is now.
    getPool(listed.id)
      .then(async (fresh) => {
        const current = fresh ?? listed;
        const [members, payments] = await Promise.all([
          getPoolMembers(current.id),
          getPoolPayments(current.id, current.currentRound),
        ]);
        return { pool: current, members, payments };
      })
      .then(
        (next) => !cancelled && setDetail(next),
        (error) => {
          // The list below still works; the hero stays generic
          console.error("Failed to load the next circle:", error);
          if (!cancelled) setDetail((d) => d ?? null);
        }
      );
    return () => {
      cancelled = true;
    };
  }, [listed, getPool, getPoolMembers, getPoolPayments, version]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const pool = detail?.pool ?? listed;
  const me = publicKey?.toBase58();
  const facts = detail ? circleFacts(pool, detail.members, detail.payments, [], me, now) : null;
  const action = facts ? circleAction(pool, facts, connected) : null;
  const dial = detail ? dialFromPool(pool, detail.members, detail.payments, [], me, now) : dialFromPoolOnly(pool);
  const drawIn = timeUntil(pool.nextDrawDate, now);
  const amount = formatAmount(pool.monthlyAmount, pool.currency);
  // The payment plus its account's rent and the fee
  const short = balance.sol !== null && balance.sol < pool.monthlyAmount + 0.003;

  const pay = async () => {
    const toastId = poolToasts.makingPayment();
    const result = await makePayment({ poolAddress: new PublicKey(pool.onChainAddress), round: pool.currentRound });
    dismissToast(toastId);
    if (result.success) poolToasts.paymentMade(result.signature!, pool.monthlyAmount, pool.currency, pool.currentRound);
    else txErrorToast(result.error || "Transaction failed");
    setVersion((v) => v + 1);
    balance.refresh();
  };

  return (
    <div className="flex flex-col items-center text-center">
      {/* Mount the dial once its seats are known: a later "new winner" would replay the draw. */}
      {detail === undefined ? (
        <SkeletonDial size={270} />
      ) : (
        <Dial spec={dial} size={270} label={`${pool.name}, round ${pool.currentRound} of ${pool.durationMonths}`} />
      )}
      <Label className="mt-1.5 flex max-w-full items-center gap-1.5">
        <span className="truncate">{pool.name}</span>
        <span className="shrink-0">· Round {pool.currentRound}/{pool.durationMonths}</span>
      </Label>
      <p className="bz-display mt-1.5">{drawIn ? `Draw in ${drawIn}` : "Draw due"}</p>
      {facts && <p className="bz-help mt-1 tabular-nums">{facts.paidCount}/{facts.seated.length} paid this round</p>}
      {detail === undefined ? (
        // Hold the button's place until we know whether it pays or opens the circle
        <div aria-hidden="true" className="bz-skel mt-5 h-[52px] w-full rounded-[26px]" />
      ) : action?.kind === "pay" ? (
        <>
          <Button className="mt-5" onClick={pay} busy={isLoading} disabled={short}>
            Pay {amount}
          </Button>
          {short && (
            <p className="bz-help text-center">
              <LowFunds />
            </p>
          )}
          <Link href={`/pools/${pool.id}`} className="bz-link mt-3 h-11">
            Open circle
          </Link>
        </>
      ) : (
        <Link href={`/pools/${pool.id}`} className="bz-button bz-button-gold mt-5">
          Open circle
        </Link>
      )}
    </div>
  );
}
