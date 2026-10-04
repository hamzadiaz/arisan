"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Dial } from "@/components/bezel/dial";
import { Icon } from "@/components/bezel/icons";
import { Button, EmptyState, Label, Note, SkeletonDial, SubDial } from "@/components/bezel/kit";
import { HistoryGrid, LastDraw, SeatList } from "@/components/bezel/circle-parts";
import { EMPTY_DIAL, dialFromPool } from "@/components/bezel/dial-spec";
import { DRAW_ERROR, parsePublicKey, useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useBalance } from "@/hooks/use-balance";
import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { SLOT_HASH_WINDOW, circleAction, circleFacts, plural } from "@/lib/circle-state";
import { addressExplorerLink, formatAmount, timeUntil } from "@/lib/format";
import { dismissToast, poolToasts, txErrorToast } from "@/lib/solana/transaction-toast";
import { cn } from "@/lib/utils";

interface PoolData {
  pool: FetchedPool | null;
  members: FetchedMember[];
  payments: FetchedPayment[];
  draws: FetchedDraw[];
}

type TxResult = { success: boolean; signature?: string; error?: string; committed?: boolean };

function plainError(message?: string) {
  return message || "Transaction failed";
}

function drawError(message?: string, committed?: boolean) {
  if (message === DRAW_ERROR.alreadyDrawn) return "This round was already drawn.";
  if (message === DRAW_ERROR.noWinner) return "No seat can win this round.";
  if (message === DRAW_ERROR.expired) return "The draw wasn’t finished in time. This round is locked on-chain.";
  if (committed) return "The draw is half done. Tap Finish the draw within 3 minutes.";
  if (message === DRAW_ERROR.notReady) return "The chain hasn’t caught up yet. Try again.";
  return plainError(message);
}

const split = (amount: string) => {
  const i = amount.lastIndexOf(" ");
  return [amount.slice(0, i), amount.slice(i)] as const;
};

const when = (date: Date) =>
  date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poolId } = use(params);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { getPool, getPoolMembers, getPoolPayments, getPoolDraws } = useSolanaPoolData();
  const actions = useSolanaPoolActions();
  const balance = useBalance();

  const [data, setData] = useState<PoolData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<"seats" | "history">("seats");
  const [working, setWorking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The round this page last drew: never offered again, even before the reload lands
  const [drawnRound, setDrawnRound] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [slot, setSlot] = useState<number | null>(null);

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
    setNow(Date.now());
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

  // Keep the countdown and the draw window current
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // A committed draw has to finish inside the SlotHashes window; read the slot to know.
  const committedSlot =
    data?.pool && data.pool.status === "active" && data.pool.randomnessRound === data.pool.currentRound
      ? data.pool.randomnessSlot
      : null;
  useEffect(() => {
    if (committedSlot === null) return;
    let cancelled = false;
    const read = () =>
      connection.getSlot("confirmed").then(
        (s) => !cancelled && setSlot(s),
        () => undefined
      );
    read();
    const t = setInterval(read, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection, committedSlot]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data && loadFailed) {
    return (
      <AppShell title="Circle" back>
        <EmptyState
          art={<Dial spec={EMPTY_DIAL} size={220} label="Empty dial" />}
          title="Can’t reach Solana"
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
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading the circle</span>
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
          art={<Dial spec={EMPTY_DIAL} size={220} label="Empty dial" />}
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
  const f = circleFacts(pool, members, payments, draws, me, now);
  const myMember = f.myMember;
  const next = circleAction(pool, f, connected);
  // Never offer the round this page just drew, even if the reload hasn't landed yet
  const action =
    (next.kind === "draw" || next.kind === "finish" || next.kind === "mark") && drawnRound === pool.currentRound
      ? ({ kind: myMember ? "paid" : "closed" } as const)
      : next;
  const drawIn = timeUntil(pool.nextDrawDate, now);
  const poolKey = new PublicKey(pool.onChainAddress);
  const dial = dialFromPool(pool, members, payments, draws, me);
  const amount = (n: number) => formatAmount(n, pool.currency);
  const expired = f.committed && slot !== null && slot > pool.randomnessSlot + SLOT_HASH_WINDOW;
  const busy = actions.isLoading || working;

  const run = async (
    start: () => string | number,
    tx: () => Promise<TxResult>,
    done: (signature: string) => void,
    explain: (message?: string, committed?: boolean) => string
  ) => {
    setWorking(true);
    const toastId = start();
    const result = await tx().catch((error: unknown): TxResult => ({
      success: false,
      error: error instanceof Error ? error.message : undefined,
    }));
    dismissToast(toastId);
    if (result.success) done(result.signature!);
    else txErrorToast(explain(result.error, result.committed));
    // Reload on failure too: a half-done draw or a round someone else drew changes the action
    await load();
    balance.refresh();
    setWorking(false);
  };

  const pay = () =>
    run(
      poolToasts.makingPayment,
      () => actions.makePayment({ poolAddress: poolKey, round: pool.currentRound }),
      (sig) => poolToasts.paymentMade(sig, pool.monthlyAmount, pool.currency, pool.currentRound),
      plainError
    );
  const stake = () =>
    run(
      poolToasts.depositingStake,
      () => actions.depositStake({ poolAddress: poolKey }),
      (sig) => poolToasts.stakeDeposited(sig, f.stakeEach, pool.currency),
      plainError
    );
  const start = () => run(poolToasts.startingPool, () => actions.startPool({ poolAddress: poolKey }), poolToasts.poolStarted, plainError);
  const claim = (d: FetchedDraw) =>
    run(
      poolToasts.claimingWinnings,
      () => actions.claimWinnings({ poolAddress: poolKey, round: d.round }),
      (sig) => poolToasts.winningsClaimed(sig, d.amount, pool.currency),
      plainError
    );
  const draw = async (finishing: boolean) => {
    const round = pool.currentRound;
    setDrawing(true);
    await run(
      finishing ? poolToasts.finishing : poolToasts.drawing,
      async () => {
        const result = await actions.executeDraw({ poolAddress: poolKey, round });
        if (result.success || result.error === DRAW_ERROR.alreadyDrawn) setDrawnRound(round);
        return result;
      },
      (sig) => poolToasts.drawn(sig, round),
      drawError
    );
    setDrawing(false);
  };
  const mark = () =>
    run(
      poolToasts.marking,
      () =>
        actions.markDefaulters({
          poolAddress: poolKey,
          round: pool.currentRound,
          wallets: f.toMark.map((m) => new PublicKey(m.walletAddress)),
        }),
      (sig) => poolToasts.marked(sig, f.toMark.length),
      (m) => (m === DRAW_ERROR.alreadyDrawn ? "This round has moved on." : plainError(m))
    );
  const leave = () =>
    run(
      poolToasts.leaving,
      () => actions.leavePool({ poolAddress: poolKey }),
      (sig) => {
        setConfirmLeave(false);
        poolToasts.left(sig);
      },
      plainError
    );
  const rejoin = () => run(poolToasts.rejoining, () => actions.rejoinPool({ poolAddress: poolKey }), poolToasts.rejoined, plainError);
  const refund = () =>
    run(
      poolToasts.refunding,
      () => actions.claimStakeRefund({ poolAddress: poolKey }),
      (sig) => poolToasts.refunded(sig, myMember?.stakeAmount ?? 0, pool.currency),
      plainError
    );
  const returnAll = () =>
    run(
      poolToasts.returningStakes,
      () =>
        actions.refundAllStakes({
          poolAddress: poolKey,
          wallets: f.stakesLeft.map((m) => new PublicKey(m.walletAddress)),
        }),
      (sig) => poolToasts.stakesReturned(sig, f.stakesLeft.length),
      plainError
    );

  // Money-moving buttons check the wallet first; fees need a little SOL on top.
  const short = (cost: number) => balance.sol !== null && balance.sol < cost + 0.001;
  const lowFunds = (cost: number) =>
    short(cost) ? (
      <>
        Not enough SOL.{" "}
        <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="bz-link">
          Get devnet SOL
        </a>
      </>
    ) : null;

  let note: React.ReactNode = null;
  let primary: React.ReactNode = null;
  let hint: React.ReactNode = null;
  let secondary: React.ReactNode = null;

  switch (action.kind) {
    case "connect":
      primary = <ConnectWalletButton />;
      break;
    case "claim":
      primary = (
        <Button onClick={() => claim(action.draw)} busy={busy}>
          Claim {amount(action.draw.amount)}
        </Button>
      );
      break;
    case "join":
      primary = (
        <Link href="/join" className="bz-button bz-button-gold">
          Join with code
        </Link>
      );
      if (f.isAuthority) hint = "Take your seat with the invite code.";
      break;
    case "stake":
      primary = (
        <Button icon="lock" onClick={stake} busy={busy} disabled={short(f.stakeEach)}>
          Deposit stake · {amount(f.stakeEach)}
        </Button>
      );
      hint = lowFunds(f.stakeEach) ?? "Returned at the end if you pay every round.";
      break;
    case "start":
      primary = (
        <Button onClick={start} disabled={!action.ready} busy={busy}>
          {!f.full ? `Waiting for seats (${f.joined}/${pool.maxMembers})` : f.staked < f.joined ? `Waiting for stakes (${f.staked}/${f.joined})` : "Start circle"}
        </Button>
      );
      hint = !f.full
        ? `${plural(pool.maxMembers - f.joined, "seat", "seats")} still open.`
        : f.staked < f.joined
          ? `${plural(f.joined - f.staked, "seat still needs", "seats still need")} to stake.`
          : "Everyone has staked.";
      break;
    case "waiting":
      primary = (
        <button disabled className="bz-button bz-button-done">
          <Icon name="check" className="size-[18px]" />
          {f.full ? "Waiting for the host to start" : `Waiting for seats (${f.joined}/${pool.maxMembers})`}
        </button>
      );
      break;
    case "finish":
      if (expired) {
        note = (
          <Note tone="signal" icon="alert" className="mt-4">
            <b>This round&rsquo;s draw expired.</b> It was started but not finished within 3 minutes, and the program can&rsquo;t restart it.
          </Note>
        );
      } else {
        primary = (
          <Button icon="draw" onClick={() => draw(true)} busy={busy || drawing} busyLabel="Drawing…">
            Finish the draw
          </Button>
        );
        hint = "One approval left. Finish within 3 minutes.";
      }
      break;
    case "rejoin":
      note = (
        <Note tone="signal" icon="alert" className="mt-4">
          <b>You were removed for missing a payment.</b> Rejoin for {amount(f.rejoinCost)}: a fresh stake plus the rounds you missed.
        </Note>
      );
      primary = (
        <Button onClick={rejoin} busy={busy} disabled={short(f.rejoinCost)}>
          Rejoin · {amount(f.rejoinCost)}
        </Button>
      );
      hint = lowFunds(f.rejoinCost);
      break;
    case "restake":
      note = (
        <Note tone="signal" icon="alert" className="mt-4">
          <b>You missed round {pool.currentRound}.</b> Restake {amount(f.stakeEach)}
          {myMember?.graceDeadline ? ` by ${when(myMember.graceDeadline)}` : ""} to keep your seat.
        </Note>
      );
      primary = (
        <Button icon="lock" onClick={stake} busy={busy} disabled={short(f.stakeEach)}>
          Restake · {amount(f.stakeEach)}
        </Button>
      );
      hint = lowFunds(f.stakeEach);
      break;
    case "blocked":
      primary = (
        <Button disabled tone="quiet">
          Payments blocked: no stake
        </Button>
      );
      hint = "Once the round is marked, you can stake and pay.";
      break;
    case "pay":
      if (myMember?.inGracePeriod) {
        note = (
          <Note tone="signal" icon="alert" className="mt-4">
            <b>You missed a round.</b> Pay {amount(pool.monthlyAmount)}
            {myMember.graceDeadline ? ` by ${when(myMember.graceDeadline)}` : ""} to keep your seat.
          </Note>
        );
      }
      primary = (
        <Button onClick={pay} busy={busy} disabled={short(pool.monthlyAmount)}>
          Pay {amount(pool.monthlyAmount)}
        </Button>
      );
      hint = lowFunds(pool.monthlyAmount);
      break;
    case "mark":
      primary = (
        <Button tone="ghost" icon="alert" onClick={mark} busy={busy}>
          Mark {f.toMark.length === 1 ? "missed payment" : `${f.toMark.length} missed payments`}
        </Button>
      );
      hint = f.stakePool ? "Their stake covers the pot. Then the draw opens." : "Starts their 48-hour grace.";
      break;
    case "draw":
      primary = (
        <Button icon="draw" onClick={() => draw(false)} busy={busy || drawing} busyLabel="Drawing… approve twice">
          Draw now
        </Button>
      );
      hint = "Two approvals. Picks a seat that hasn’t won.";
      break;
    case "paid":
      primary = (
        <button disabled className="bz-button bz-button-done">
          <Icon name="check" className="size-[18px]" />
          Paid for round {pool.currentRound}
        </button>
      );
      if (f.drawDue && drawnRound !== pool.currentRound) {
        hint =
          f.waitingOn.length > 0
            ? `Waiting for ${plural(f.waitingOn.length, "seat", "seats")} in grace to pay.`
            : f.eligible === 0
              ? "No seat can win this round."
              : null;
      }
      break;
    case "closed":
      hint = "Started · joining is closed.";
      break;
    case "refund":
      primary = (
        <Button icon="lock" onClick={refund} busy={busy}>
          Get {amount(myMember!.stakeAmount)} back
        </Button>
      );
      break;
    case "returnAll":
      primary = (
        <Button tone="ghost" icon="lock" onClick={returnAll} busy={busy}>
          Return {f.stakesLeft.length === 1 ? "the last stake" : `${f.stakesLeft.length} stakes`}
        </Button>
      );
      hint = "Sends each stake back to its owner. You pay the fee.";
      break;
    case "complete":
      hint = "Complete.";
      break;
  }

  // Leaving is only possible before the start; it refunds the stake and frees the seat.
  if (pool.status === "pending" && myMember && connected) {
    secondary = confirmLeave ? (
      <div className="mt-3 rounded-[14px] bg-card p-3.5 text-[14px] leading-snug shadow-[inset_0_0_0_1px_var(--border)]">
        <p>
          <b>Leave this circle?</b>{" "}
          {myMember.stakeDeposited && myMember.stakeAmount > 0 ? `Your ${amount(myMember.stakeAmount)} stake comes back to you.` : "Your seat opens up for someone else."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button tone="ghost" onClick={() => setConfirmLeave(false)} disabled={busy}>
            Stay
          </Button>
          <Button tone="quiet" className="text-signal" onClick={leave} busy={busy} busyLabel="Leaving…">
            Leave
          </Button>
        </div>
      </div>
    ) : (
      <button onClick={() => setConfirmLeave(true)} className="bz-link mx-auto mt-3 flex text-[13.5px] text-muted-foreground">
        Leave circle
      </button>
    );
  }
  // After the circle completes, anyone's leftover stakes can go back in one tap.
  if (action.kind === "refund" && f.stakesLeft.length > 0) {
    secondary = (
      <button onClick={returnAll} disabled={busy} className="bz-link mx-auto mt-3 flex text-[13.5px] text-muted-foreground">
        Return everyone&rsquo;s stake ({f.stakesLeft.length})
      </button>
    );
  }

  const [potNum, potUnit] = split(amount(f.pot));
  const lastDraw = draws.length ? draws.reduce((a, b) => (b.round > a.round ? b : a)) : null;
  const drawValue = f.committed ? (expired ? "Locked" : "Now") : drawIn ?? (f.canDraw ? "Ready" : "Due");
  const drawTone = f.committed ? (expired ? "signal" : "ready") : drawIn ? undefined : f.canDraw ? "ready" : "signal";

  return (
    <AppShell title={pool.name} back>
      <Dial spec={dial} size={280} view="top" numerals drawing={drawing} label={`${pool.name}: ${members.length} of ${pool.maxMembers} seats`} />

      <div className="mt-1 flex items-center justify-center gap-2">
        <Label>
          {pool.status === "active"
            ? `Round ${pool.currentRound} of ${pool.durationMonths}`
            : pool.status === "pending"
              ? `${f.joined} of ${pool.maxMembers} joined`
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
            <SubDial label="Joined" value={f.joined} unit={`/${pool.maxMembers}`} />
            <SubDial label="Staked" value={f.stakePool ? f.staked : "–"} unit={f.stakePool ? `/${pool.maxMembers}` : undefined} />
          </>
        ) : pool.status === "active" ? (
          <>
            <SubDial label="Paid" value={f.paidCount} unit={`/${f.seated.length}`} />
            <SubDial label="Draw" value={drawValue} tone={drawTone} />
          </>
        ) : (
          <>
            <SubDial label="Rounds" value={pool.durationMonths} unit={`/${pool.durationMonths}`} />
            <SubDial label="Paid out" value={draws.length} unit={draws.length === 1 ? " pot" : " pots"} />
          </>
        )}
      </div>

      {!myMember && pool.status !== "completed" && (
        <p className="bz-help text-center">
          {amount(pool.monthlyAmount)} / round{f.stakePool ? ` · ${amount(f.stakeEach)} stake` : ""}
        </p>
      )}

      {note}
      {primary && <div className="mt-4">{primary}</div>}
      {hint && <div className="bz-help text-center">{hint}</div>}
      {secondary}

      {lastDraw && <LastDraw draw={lastDraw} me={me} currency={pool.currency} />}

      <div role="tablist" aria-label="Circle details" className="bz-seg mt-5 grid-cols-2">
        <button
          role="tab"
          id="tab-seats"
          aria-controls="panel-circle"
          aria-selected={tab === "seats"}
          tabIndex={tab === "seats" ? 0 : -1}
          onClick={() => setTab("seats")}
          onKeyDown={(e) => (e.key === "ArrowRight" || e.key === "ArrowLeft") && (setTab("history"), document.getElementById("tab-history")?.focus())}
        >
          <Icon name="seats" className="size-4" />
          Seats
        </button>
        <button
          role="tab"
          id="tab-history"
          aria-controls="panel-circle"
          aria-selected={tab === "history"}
          tabIndex={tab === "history" ? 0 : -1}
          onClick={() => setTab("history")}
          onKeyDown={(e) => (e.key === "ArrowRight" || e.key === "ArrowLeft") && (setTab("seats"), document.getElementById("tab-seats")?.focus())}
        >
          <Icon name="history" className="size-4" />
          History
        </button>
      </div>

      <div role="tabpanel" id="panel-circle" aria-labelledby={tab === "seats" ? "tab-seats" : "tab-history"} className="mt-2">
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
        <a href={addressExplorerLink(pool.onChainAddress)} target="_blank" rel="noopener noreferrer" className="bz-link bz-hit inline-flex min-h-[44px] items-center text-[13.5px]">
          Explorer
          <Icon name="external" className="size-3.5" />
        </a>
      </div>
    </AppShell>
  );
}
