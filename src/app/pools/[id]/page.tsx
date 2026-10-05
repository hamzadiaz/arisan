"use client";

import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { ConnectWalletButton } from "@/components/mobile/wallet-button";
import { Dial } from "@/components/bezel/dial";
import { Icon } from "@/components/bezel/icons";
import { Button, EmptyState, Label, LowFunds, Note, SkeletonDial, SubDial } from "@/components/bezel/kit";
import { HistoryGrid, LastDraw, SeatList } from "@/components/bezel/circle-parts";
import { InviteCode, shareInvite } from "@/components/bezel/invite";
import { EMPTY_DIAL, dialFromPool } from "@/components/bezel/dial-spec";
import { DRAW_ERROR, parsePublicKey, useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useBalance } from "@/hooks/use-balance";
import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { SLOT_HASH_WINDOW, circleAction, circleFacts, plural } from "@/lib/circle-state";
import { addressExplorerLink, formatAmount, timeUntil } from "@/lib/format";
import { readInviteFromChain, rememberInvite, savedInvite, subscribeInvites } from "@/lib/invites";
import { PROGRAM_ID } from "@/lib/solana/program";
import { dismissToast, poolToasts, txErrorToast } from "@/lib/solana/transaction-toast";
import { cn } from "@/lib/utils";

interface PoolData {
  pool: FetchedPool | null;
  members: FetchedMember[];
  payments: FetchedPayment[];
  draws: FetchedDraw[];
}

type TxResult = { success: boolean; signature?: string; error?: string; committed?: boolean; stage?: "committed" | "drawn" | "prepared" };

/** Fees, a Payment or Draw account's rent, and a possible vault top-up */
const FEE_MARGIN = 0.003;

function plainError(message?: string) {
  return message || "Transaction failed";
}

function drawError(message?: string, committed?: boolean) {
  if (message === DRAW_ERROR.alreadyDrawn) return "This round was already drawn.";
  if (message === DRAW_ERROR.alreadyStarted) return "Someone already started this draw. Finish it now.";
  if (message === DRAW_ERROR.roundMoved) return "Your draw started on the next round. Finish it within 3 minutes or the circle locks.";
  if (message === DRAW_ERROR.noWinner) return "No seat can win this round.";
  if (message === DRAW_ERROR.vaultShort) return "The vault can’t cover this pot without spending stakes.";
  if (message === DRAW_ERROR.expired) return "The draw wasn’t finished within 3 minutes. This circle is locked until the program is fixed.";
  if (message === DRAW_ERROR.tooBig) return "This circle is too big to draw in one transaction.";
  if (message === DRAW_ERROR.unpaid)
    return committed
      ? "Not every seat has paid. The draw finishes once they do, within 3 minutes."
      : "Every seat pays this round before the draw.";
  if (committed) return "The draw is started. Tap Finish the draw within 3 minutes.";
  if (message === DRAW_ERROR.notReady) return "The chain hasn’t caught up yet. Try again.";
  return plainError(message);
}

const split = (amount: string) => {
  const i = amount.lastIndexOf(" ");
  return [amount.slice(0, i), amount.slice(i)] as const;
};

const noInvite = () => null;

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
  const stayButton = useRef<HTMLButtonElement>(null);
  const leaveTrigger = useRef<HTMLButtonElement>(null);
  // Keyboard focus follows the inline confirm: onto Stay when it opens, back to the trigger after
  useEffect(() => {
    if (confirmLeave) stayButton.current?.focus();
  }, [confirmLeave]);
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

  // The invite code, for members and the host while seats are open. The pool keeps only its
  // hash: this device may have the code from creating or joining, or it's read back from the
  // create transaction.
  const me = publicKey?.toBase58();
  const invite = useSyncExternalStore(subscribeInvites, () => savedInvite(poolId), noInvite);
  const [inviteMissing, setInviteMissing] = useState<string | null>(null);
  const inviteRead = useRef<string | null>(null);
  const filling = data?.pool?.status === "pending" && data.members.length < data.pool.maxMembers ? data : null;
  const inviteHash =
    filling && me && (filling.pool?.creatorId === me || filling.members.some((m) => m.walletAddress === me))
      ? filling.pool?.inviteCodeHash
      : undefined;
  useEffect(() => {
    if (!inviteHash || invite || inviteRead.current === poolId) return;
    inviteRead.current = poolId;
    readInviteFromChain(connection, new PublicKey(poolId), PROGRAM_ID, inviteHash).then(
      (code) => (code ? rememberInvite(poolId, code) : setInviteMissing(poolId)),
      (error) => {
        console.warn("Couldn't read the invite code back:", error);
        setInviteMissing(poolId);
      }
    );
  }, [connection, poolId, invite, inviteHash]);

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
  const dial = dialFromPool(pool, members, payments, draws, me, now);
  const amount = (n: number) => formatAmount(n, pool.currency);
  const expired = f.committed && slot !== null && slot > pool.randomnessSlot + SLOT_HASH_WINDOW;
  const busy = actions.isLoading || working;

  const run = async (
    start: () => string | number,
    tx: () => Promise<TxResult>,
    done: (signature: string, result: TxResult) => void,
    explain: (message?: string, committed?: boolean) => string
  ) => {
    setWorking(true);
    const toastId = start();
    const result = await tx().catch((error: unknown): TxResult => ({
      success: false,
      error: error instanceof Error ? error.message : undefined,
    }));
    dismissToast(toastId);
    if (result.success) done(result.signature!, result);
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
  const restakeAndPay = () =>
    run(
      poolToasts.depositingStake,
      () => actions.depositStake({ poolAddress: poolKey, payRound: pool.currentRound }),
      (sig) => poolToasts.paymentMade(sig, pool.monthlyAmount, pool.currency, pool.currentRound),
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
  // One step per tap: Draw now commits, Finish the draw pays the winner.
  const draw = async () => {
    const round = pool.currentRound;
    setDrawing(true);
    await run(
      f.committed ? poolToasts.finishing : poolToasts.drawing,
      async () => {
        const result = await actions.executeDraw({ poolAddress: poolKey, round });
        if ((result.success && result.stage === "drawn") || result.error === DRAW_ERROR.alreadyDrawn) setDrawnRound(round);
        return result;
      },
      (sig, result) =>
        result.stage === "drawn"
          ? poolToasts.drawn(sig, round)
          : result.stage === "prepared"
            ? poolToasts.drawPrepared(sig)
            : poolToasts.drawStarted(sig),
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
      (sig) => poolToasts.marked(sig, f.toMark.length, f.toKick.length),
      (m) => (m === DRAW_ERROR.alreadyDrawn ? "This round has moved on." : plainError(m))
    );
  const leave = () =>
    run(
      poolToasts.leaving,
      () => actions.leavePool({ poolAddress: poolKey }),
      (sig) => {
        setConfirmLeave(false);
        poolToasts.left(sig, !!myMember?.stakeDeposited && (myMember?.stakeAmount ?? 0) > 0);
      },
      plainError
    );
  // A removed member hasn't paid this round either: rejoin and pay in one transaction
  const rejoin = () =>
    run(poolToasts.rejoining, () => actions.rejoinPool({ poolAddress: poolKey, payRound: pool.currentRound }), poolToasts.rejoined, plainError);
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

  // Money-moving buttons check the wallet first: the amount plus fees and account rent.
  const short = (cost: number) => balance.sol !== null && balance.sol < cost + FEE_MARGIN;
  const lowFunds = (cost: number) => (short(cost) ? <LowFunds /> : null);

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
      // The host's code is known here: their seat is one tap away on Join
      primary =
        f.isAuthority && invite ? (
          <Link href={`/join?code=${invite}`} className="bz-button bz-button-gold">
            Take your seat
          </Link>
        ) : (
          <Link href="/join" className="bz-button bz-button-gold">
            Join with code
          </Link>
        );
      if (f.isAuthority && !invite) hint = "Take your seat with the invite code.";
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
          Start circle
        </Button>
      );
      hint = !f.full
        ? `${plural(pool.maxMembers - f.joined, "seat", "seats")} still open.`
        : f.staked < f.joined
          ? `${plural(f.joined - f.staked, "seat still needs", "seats still need")} to stake.`
          : f.stakePool
            ? "Everyone has staked."
            : "Everyone’s in.";
      break;
    case "waiting":
      primary = (
        <button disabled className="bz-button bz-button-done">
          <Icon name="check" className="size-[18px]" />
          {f.full
            ? "You’re in · waiting for the host"
            : `${f.stakePool ? "Staked" : "You’re in"} · ${plural(pool.maxMembers - f.joined, "seat", "seats")} open`}
        </button>
      );
      break;
    case "finish":
      if (expired) {
        note = (
          <Note tone="signal" icon="alert" className="mt-4">
            <b>This circle is locked.</b> Its draw wasn&rsquo;t finished within 3 minutes: no more rounds or refunds until the program is fixed.
          </Note>
        );
      } else {
        primary = (
          <Button icon="draw" onClick={draw} busy={busy || drawing} busyLabel="Finishing…" disabled={short(0)}>
            Finish the draw
          </Button>
        );
        hint =
          lowFunds(0) ??
          (f.uncovered > 0
            ? `${plural(f.uncovered, "seat hasn’t", "seats haven’t")} paid: the draw finishes only once every seat pays. Within 3 minutes, or the circle locks.`
            : "Last step. Finish within 3 minutes or the circle locks.");
      }
      break;
    case "finishLater":
      note = (
        <Note icon="info" className="mt-4">
          <b>The host started this draw early.</b> Only they can finish it before {when(pool.nextDrawDate)}. If nobody finishes it within 3 minutes, the circle locks.
        </Note>
      );
      break;
    case "rejoin": {
      const total = f.rejoinCost + pool.monthlyAmount;
      note = (
        <Note tone="signal" icon="alert" className="mt-4">
          <b>You were removed for missing a payment.</b> Rejoin with a fresh stake,{" "}
          {(myMember?.missedRounds ?? 1) > 1 ? `the ${myMember?.missedRounds} rounds you missed` : "the round you missed"} and this round&rsquo;s payment.
        </Note>
      );
      primary = (
        <Button onClick={rejoin} busy={busy} disabled={short(total)}>
          Rejoin and pay · {amount(total)}
        </Button>
      );
      hint = lowFunds(total);
      break;
    }
    case "restake": {
      const total = f.stakeEach + pool.monthlyAmount;
      note = (
        <Note tone="signal" icon="alert" className="mt-4">
          <b>You missed a round.</b> Restake {amount(f.stakeEach)} and pay this round
          {myMember?.graceDeadline ? ` by ${when(myMember.graceDeadline)}` : ""} to keep your seat.
        </Note>
      );
      primary = (
        <Button icon="lock" onClick={restakeAndPay} busy={busy} disabled={short(total)}>
          Restake and pay · {amount(total)}
        </Button>
      );
      hint = lowFunds(total);
      break;
    }
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
      } else if (f.committed) {
        note = (
          <Note tone="gold" icon="draw" className="mt-4">
            <b>A draw has started.</b> Pay first so your share is in the pot.
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
    case "mark": {
      const all = f.toMark.length;
      const kicks = f.toKick.length;
      // A removed seat that hasn't won loses its turn unless it rejoins
      const owedTurn = f.toKick.some((m) => !m.hasWon);
      primary = (
        <Button tone="ghost" icon="alert" onClick={mark} busy={busy}>
          {kicks === all
            ? `Remove ${all === 1 ? "1 seat" : `${all} seats`}`
            : `Mark ${all === 1 ? "missed payment" : `${all} missed payments`}`}
        </Button>
      );
      hint =
        kicks > 0
          ? owedTurn
            ? "Their 48-hour grace is over: this removes them, and the draw goes on without them. They lose their turn unless they rejoin."
            : "Their 48-hour grace is over: this removes them, and the draw goes on without them."
          : f.stakePool
            ? "Slashes their stake and starts a 48-hour grace. The draw waits until they pay."
            : "Starts their 48-hour grace. The draw waits until they pay.";
      break;
    }
    case "draw":
      primary = (
        <Button icon="draw" onClick={draw} busy={busy || drawing} busyLabel="Starting the draw…" disabled={short(0)}>
          Draw now
        </Button>
      );
      hint = lowFunds(0) ?? "Two steps: start, then finish within 3 minutes.";
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
          f.spared.length > 0
            ? `Waiting for ${plural(f.spared.length, "seat", "seats")} to pay: ${f.spared.length === 1 ? "it’s the only one" : "they’re the only ones"} left that can win.`
            : f.waitingOn.length > 0
              ? `Waiting for ${plural(f.waitingOn.length, "seat", "seats")} to pay.`
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
        <Button icon="coin" onClick={refund} busy={busy}>
          Get {amount(myMember!.stakeAmount)} back
        </Button>
      );
      break;
    case "returnAll":
      primary = (
        <Button tone="ghost" icon="coin" onClick={returnAll} busy={busy}>
          Return {f.stakesLeft.length === 1 ? "the last stake" : `${f.stakesLeft.length} stakes`}
        </Button>
      );
      hint = f.stakesLeft.length === 1 ? "Sends it back to its owner. You pay the fee." : "Sends each stake back to its owner. You pay the fee.";
      break;
    case "complete":
      break;
  }

  // Leaving is only possible before the start; it refunds the stake and frees the seat.
  if (pool.status === "pending" && myMember && connected) {
    secondary = confirmLeave ? (
      <div className="mt-3 rounded-[14px] bg-card p-3.5 text-[14px] leading-snug shadow-[inset_0_0_0_1px_var(--border)]">
        <p className="font-semibold">Leave this circle?</p>
        <p className="mt-0.5 text-muted-foreground">
          {myMember.stakeDeposited && myMember.stakeAmount > 0 ? `Your ${amount(myMember.stakeAmount)} stake comes back to you.` : "Your seat opens up for someone else."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            ref={stayButton}
            tone="ghost"
            onClick={() => {
              setConfirmLeave(false);
              setTimeout(() => leaveTrigger.current?.focus(), 0);
            }}
            disabled={busy}
          >
            Stay
          </Button>
          <Button tone="quiet" className="text-signal" onClick={leave} busy={busy} busyLabel="Leaving…">
            Leave
          </Button>
        </div>
      </div>
    ) : (
      <button ref={leaveTrigger} onClick={() => setConfirmLeave(true)} className="bz-button bz-button-ghost bz-button-sm mx-auto mt-3">
        <Icon name="leave" className="size-4" />
        Leave circle
      </button>
    );
  }
  // After the circle completes, anyone's leftover stakes can go back in one tap.
  if (action.kind === "refund" && f.stakesLeft.length > 0) {
    secondary = (
      <button onClick={returnAll} disabled={busy} className="bz-button bz-button-ghost bz-button-sm mx-auto mt-3">
        <Icon name="coin" className="size-4" />
        {f.stakesLeft.length === 1 ? "Return the last stake" : `Return ${f.stakesLeft.length} stakes`}
      </button>
    );
  }

  // Inviting is for members (and the host) while seats are open
  const showInvite = pool.status === "pending" && !f.full && (!!myMember || f.isAuthority);
  const inviteLoading = !invite && inviteMissing !== poolId && !!pool.inviteCodeHash;

  const [potNum, potUnit] = split(amount(f.pot));
  const lastDraw = draws.length ? draws.reduce((a, b) => (b.round > a.round ? b : a)) : null;
  const drawValue = f.committed ? (expired ? "Locked" : "Finish") : drawIn ?? (f.canDraw ? "Ready" : "Due");
  const drawTone = f.committed ? (expired ? "signal" : "ready") : drawIn ? undefined : f.canDraw ? "ready" : "signal";

  return (
    <AppShell title={pool.name} back>
      {loadFailed && (
        <Note tone="signal" icon="offline" className="mb-3 mt-1">
          Can&rsquo;t reach Solana. Showing the last data.
        </Note>
      )}

      <Dial spec={dial} size={280} view="top" numerals drawing={drawing} label={`${pool.name}: ${members.length} of ${pool.maxMembers} seats`} />

      <div className="mt-3 flex items-center justify-center gap-2">
        <Label>
          {pool.status === "active"
            ? `Round ${pool.currentRound} of ${pool.durationMonths}`
            : pool.status === "pending"
              ? `${amount(pool.monthlyAmount)} a round · ${plural(pool.durationMonths, "round", "rounds")}`
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
      {showInvite &&
        (invite ? (
          <div className="mt-5 flex flex-col">
            <Label className="text-center">Invite code</Label>
            <InviteCode code={invite} compact className="mt-2" />
            <Button tone="ghost" icon="share" className="mt-3" onClick={() => shareInvite(pool.name, invite)}>
              Share invite
            </Button>
          </div>
        ) : inviteLoading ? (
          <div className="bz-skel mt-5 h-[150px] rounded-[20px]" aria-hidden="true" />
        ) : f.isAuthority ? (
          <p className="bz-help text-center">Share the invite code you saved when you created the circle.</p>
        ) : null)}
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
