"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Dial } from "@/components/bezel/dial";
import { MiniDial } from "@/components/bezel/mini-dial";
import { Icon } from "@/components/bezel/icons";
import { Button, EmptyState, Label, Note, SkeletonDial, SubDial } from "@/components/bezel/kit";
import { HistoryGrid, LastDraw, SeatList } from "@/components/bezel/circle-parts";
import { EMPTY_DIAL, dialFromPool } from "@/components/bezel/dial-spec";
import { parsePublicKey, useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { addressExplorerLink, formatAmount, timeUntil } from "@/lib/format";
import { dismissToast, poolToasts, txErrorToast } from "@/lib/solana/transaction-toast";
import { cn } from "@/lib/utils";

interface PoolData {
  pool: FetchedPool | null;
  members: FetchedMember[];
  payments: FetchedPayment[];
  draws: FetchedDraw[];
}

// The program lets anyone draw once the deadline has passed. Leave a minute for clock skew.
const DRAW_GRACE_MS = 60_000;

function drawError(message?: string) {
  if (!message) return "The draw didn't go through";
  if (/not ready/i.test(message)) return "The draw isn't ready yet. Try again in a moment.";
  if (/unauthorized/i.test(message)) return "The draw opens after this round's deadline.";
  if (/expired/i.test(message)) return "This draw took too long and expired. The host can run it now.";
  return message;
}

const split = (amount: string) => {
  const i = amount.lastIndexOf(" ");
  return [amount.slice(0, i), amount.slice(i)] as const;
};

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poolId } = use(params);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { getPool, getPoolMembers, getPoolPayments, getPoolDraws } = useSolanaPoolData();
  const actions = useSolanaPoolActions();

  const [data, setData] = useState<PoolData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<"seats" | "history">("seats");
  const [drawing, setDrawing] = useState(false);
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
      <AppShell title="Circle" back>
        <EmptyState
          art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
          title="Can't reach Solana"
          action={
            <Button tone="ghost" icon="refresh" onClick={refresh} busy={refreshing} busyLabel="Trying…">
              Try again
            </Button>
          }
        >
          Check your connection.
        </EmptyState>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Circle" back>
        <div aria-busy="true" aria-label="Loading the circle">
          <SkeletonDial size={280} />
          <div className="mt-4 grid grid-cols-3 justify-items-center gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bz-skel size-[104px] rounded-full" />
            ))}
          </div>
          <div className="bz-skel mt-5 h-[52px] rounded-[26px]" />
        </div>
      </AppShell>
    );
  }

  const { pool, members, payments, draws } = data;

  if (!pool) {
    return (
      <AppShell title="Circle" back>
        <EmptyState
          art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
          title="Circle not found"
          action={
            <Link href="/" className="bz-button bz-button-ghost">
              Go home
            </Link>
          }
        >
          Check the link, or ask for the invite code again.
        </EmptyState>
      </AppShell>
    );
  }

  const me = publicKey?.toBase58();
  const myMember = members.find((m) => m.walletAddress === me);
  const isAuthority = me === pool.creatorId;
  const paidThisRound = new Set(payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress));
  const unclaimedWin = draws.find((d) => d.winnerAddress === me && !d.claimed);
  const drawIn = timeUntil(pool.nextDrawDate);
  const pot = pool.monthlyAmount * (pool.status === "pending" ? pool.maxMembers : members.length);
  const poolKey = new PublicKey(pool.onChainAddress);
  const dial = dialFromPool(pool, members, payments, draws, me);

  const run = async (
    start: () => string | number,
    tx: () => Promise<{ success: boolean; signature?: string; error?: string }>,
    done: (signature: string) => void,
    explain: (message?: string) => string = (m) => m || "Transaction failed"
  ) => {
    const toastId = start();
    const result = await tx();
    dismissToast(toastId);
    if (result.success) {
      done(result.signature!);
      await load();
    } else {
      txErrorToast(explain(result.error));
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
  const start = () => run(poolToasts.startingPool, () => actions.startPool({ poolAddress: poolKey }), poolToasts.poolStarted);
  const claim = (d: FetchedDraw) =>
    run(
      poolToasts.claimingWinnings,
      () => actions.claimWinnings({ poolAddress: poolKey, round: d.round }),
      (sig) => poolToasts.winningsClaimed(sig, d.amount, pool.currency)
    );
  const draw = async () => {
    setDrawing(true);
    await run(
      poolToasts.drawing,
      () => actions.executeDraw({ poolAddress: poolKey, round: pool.currentRound }),
      (sig) => poolToasts.drawn(sig, pool.currentRound),
      drawError
    );
    setDrawing(false);
  };
  const refund = () =>
    run(
      poolToasts.refunding,
      () => actions.claimStakeRefund({ poolAddress: poolKey }),
      (sig) => poolToasts.refunded(sig, myMember?.stakeAmount ?? 0, pool.currency)
    );

  const busy = actions.isLoading;
  const stakePool = pool.stakeEnabled !== false;
  const needsStake = stakePool && myMember && !myMember.stakeDeposited;
  // start_pool does not check stakes on-chain; an unstaked member of a started pool can
  // neither stake nor pay. Only offer Start once everyone has staked.
  const staked = stakePool ? members.filter((m) => m.stakeDeposited).length : members.length;
  // total_rounds is fixed to max_members on-chain; a pool started below capacity runs
  // out of eligible winners and never completes, locking stakes (issue #13).
  const full = members.length >= pool.maxMembers;
  // The draw takes two approvals inside a short window and pays the pot even if someone
  // hasn't paid. Offer it only after the deadline, once every seat has paid, and only once.
  const inGood = members.filter((m) => !m.isKicked);
  const paidCount = inGood.filter((m) => paidThisRound.has(m.walletAddress)).length;
  const drawDue = pool.status === "active" && Date.now() > pool.nextDrawDate.getTime() + DRAW_GRACE_MS;
  const drawnThisRound = draws.some((d) => d.round === pool.currentRound);
  const canDraw = drawDue && paidCount === inGood.length && !drawnThisRound;
  const refundable = pool.status === "completed" && myMember?.stakeDeposited && (myMember.stakeAmount ?? 0) > 0;

  let primary: React.ReactNode = null;
  let hint: React.ReactNode = null;
  if (!connected) {
    primary = <ConnectWalletButton />;
  } else if (unclaimedWin) {
    primary = (
      <Button onClick={() => claim(unclaimedWin)} busy={busy}>
        Claim {formatAmount(unclaimedWin.amount, pool.currency)}
      </Button>
    );
  } else if (!myMember && pool.status === "pending") {
    primary = (
      <Link href="/join" className="bz-button bz-button-gold">
        Join with code
      </Link>
    );
    if (isAuthority) hint = "You made this circle. Join with its invite code to take a seat.";
  } else if (needsStake && pool.status === "pending") {
    primary = (
      <Button icon="lock" onClick={stake} busy={busy}>
        Deposit stake
      </Button>
    );
    hint = "Returned at the end if you pay every round.";
  } else if (isAuthority && pool.status === "pending") {
    primary = (
      <Button onClick={start} disabled={!full || staked < members.length} busy={busy}>
        {!full ? `Waiting for members (${members.length}/${pool.maxMembers})` : staked < members.length ? `Waiting for stakes (${staked}/${members.length})` : "Start circle"}
      </Button>
    );
    hint = !full ? `${pool.maxMembers - members.length} seats still open.` : staked < members.length ? `${members.length - staked} seats still need to stake.` : "Everyone has staked.";
  } else if (myMember?.isKicked) {
    primary = (
      <Button disabled tone="quiet">
        You were removed from this circle
      </Button>
    );
  } else if (myMember && pool.status === "active" && needsStake && myMember.inGracePeriod) {
    // Slashed for a missed round: the program requires a fresh stake before paying again
    primary = (
      <Button icon="lock" onClick={stake} busy={busy}>
        Restake to stay in
      </Button>
    );
  } else if (myMember && pool.status === "active" && needsStake) {
    primary = (
      <Button disabled tone="quiet">
        No stake deposited · payments are blocked
      </Button>
    );
  } else if (myMember && pool.status === "active" && !paidThisRound.has(me!)) {
    primary = (
      <Button onClick={pay} busy={busy}>
        Pay {formatAmount(pool.monthlyAmount, pool.currency)}
      </Button>
    );
  } else if (myMember && pool.status === "active" && canDraw) {
    primary = (
      <Button icon="draw" onClick={draw} busy={busy} busyLabel="Drawing… approve twice">
        Draw now
      </Button>
    );
    hint = "Two approvals. The chain picks from seats in good standing that haven't won.";
  } else if (myMember && pool.status === "active") {
    primary = (
      <button disabled className="bz-button bz-button-done">
        <Icon name="check" className="size-[18px]" />
        Paid for round {pool.currentRound}
      </button>
    );
    if (drawDue && !drawnThisRound) hint = `The draw opens when every seat has paid (${paidCount}/${inGood.length}).`;
  } else if (refundable) {
    primary = (
      <Button icon="lock" onClick={refund} busy={busy}>
        Get {formatAmount(myMember!.stakeAmount, pool.currency)} back
      </Button>
    );
  } else if (!myMember && pool.status === "active") {
    hint = "Started · joining is closed.";
  } else if (pool.status === "completed") {
    hint = "Complete.";
  }

  const [potNum, potUnit] = split(formatAmount(pot, pool.currency));
  const lastDraw = draws.length ? draws.reduce((a, b) => (b.round > a.round ? b : a)) : null;

  return (
    <AppShell title={pool.name} back>
      <Dial spec={dial} size={280} view="top" numerals drawing={drawing} label={`${pool.name}: ${members.length} of ${pool.maxMembers} seats`} />

      <div className="mt-1 flex items-center justify-center gap-2">
        <Label>
          {pool.status === "active"
            ? `Round ${pool.currentRound} of ${pool.durationMonths}`
            : pool.status === "pending"
              ? `${members.length} of ${pool.maxMembers} joined`
              : "Complete"}
        </Label>
        <button onClick={refresh} className="bz-hit flex size-7 items-center justify-center rounded-full text-muted-foreground active:bg-secondary" aria-label="Refresh">
          <Icon name="refresh" className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 justify-items-center gap-2.5">
        <SubDial label="Pot" value={potNum} unit={potUnit} />
        {pool.status === "pending" ? (
          <>
            <SubDial label="Joined" value={members.length} unit={`/${pool.maxMembers}`} />
            <SubDial label="Staked" value={stakePool ? staked : "–"} unit={stakePool ? `/${members.length}` : undefined} />
          </>
        ) : pool.status === "active" ? (
          <>
            <SubDial label="Paid" value={paidThisRound.size} unit={`/${members.length}`} />
            <SubDial label="Draw" value={drawnThisRound ? "Done" : drawIn ?? "Ready"} tone={!drawIn && !drawnThisRound ? "ready" : undefined} />
          </>
        ) : (
          <>
            <SubDial label="Rounds" value={pool.durationMonths} unit={`/${pool.durationMonths}`} />
            <SubDial label="Paid out" value={draws.length} unit=" pots" />
          </>
        )}
      </div>

      <p className="bz-help text-center">
        {formatAmount(pool.monthlyAmount, pool.currency)} / round{stakePool ? " · stake required" : ""}
      </p>

      {primary && <div className="mt-4">{primary}</div>}
      {pool.status === "active" && (
        <p className="mt-2 text-center text-[13px] text-muted-foreground tabular-nums">
          {paidThisRound.size}/{members.length} paid this round
        </p>
      )}
      {hint && <p className="bz-help text-center">{hint}</p>}

      {myMember?.inGracePeriod && pool.status === "active" && (
        <Note tone="signal" icon="alert" className="mt-4">
          <b>You missed a round.</b> Restake to keep your seat
          {myMember.graceDeadline ? ` before ${myMember.graceDeadline.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
        </Note>
      )}

      {lastDraw && <LastDraw draw={lastDraw} me={me} currency={pool.currency} />}

      <div role="tablist" aria-label="Circle details" className="bz-seg mt-5 grid-cols-2">
        <button role="tab" aria-selected={tab === "seats"} onClick={() => setTab("seats")}>
          <Icon name="seats" className="size-4" />
          Seats
        </button>
        <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>
          <Icon name="history" className="size-4" />
          History
        </button>
      </div>

      <div role="tabpanel" className="mt-2">
        {tab === "seats" ? (
          <SeatList pool={pool} members={members} payments={payments} me={me} />
        ) : (
          <div className="pt-2">
            <HistoryGrid pool={pool} members={members} payments={payments} draws={draws} me={me} />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between px-0.5">
        <StatusPill status={pool.status} />
        <a href={addressExplorerLink(pool.onChainAddress)} target="_blank" rel="noopener noreferrer" className="bz-link text-[13.5px]">
          Explorer
          <Icon name="external" className="size-3.5" />
        </a>
      </div>
    </AppShell>
  );
}
