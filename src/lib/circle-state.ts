import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { settleRound } from "@/lib/solana/round-settlement";

/** The program lets anyone draw once the deadline has passed. Leave a minute for clock skew. */
export const DRAW_GRACE_MS = 60_000;
/** SlotHashes keeps 512 slots (about 3.4 minutes): a committed draw must finish inside it. */
export const SLOT_HASH_WINDOW = 512;

/** Everything the circle screen decides from one read of the chain. */
export interface CircleFacts {
  me?: string;
  myMember?: FetchedMember;
  isAuthority: boolean;
  stakePool: boolean;
  /** contribution × stake multiplier, 0 when stakes are off */
  stakeEach: number;
  /** Members still seated (not kicked); the pot pays contribution × this many. */
  seated: FetchedMember[];
  paid: Set<string>;
  paidCount: number;
  staked: number;
  joined: number;
  full: boolean;
  pot: number;
  /** Active, and the round's deadline (plus a minute) has passed */
  drawDue: boolean;
  /** Randomness is committed for this round: one approval finishes the draw. */
  committed: boolean;
  /** Seats that missed the deadline and can be marked now (slash + grace, or kick). */
  toMark: FetchedMember[];
  /** The part of toMark whose grace is over: marking removes them from the circle */
  toKick: FetchedMember[];
  /** The round's deadline has passed (anyone may finish a started draw) */
  pastDeadline: boolean;
  /** Seats that haven't paid this round, removed ones included: the draw needs every one */
  uncovered: number;
  /** Marking every unpaid seat would leave nobody able to win: wait for them to pay instead */
  markLeavesNoWinner: boolean;
  /** Seats that haven't paid this round: the program draws only once every one has */
  waitingOn: FetchedMember[];
  /** Seats that can still win this round */
  eligible: number;
  canDraw: boolean;
  unclaimedWin?: FetchedDraw;
  /** Completed circle: my stake is still in the vault */
  refundable: boolean;
  /** Completed circle: other members whose stake is still in the vault */
  stakesLeft: FetchedMember[];
  /** Kicked: fresh stake plus the rounds missed */
  rejoinCost: number;
}

const seconds = (date: Date) => date.getTime() / 1000;

export function circleFacts(
  pool: FetchedPool,
  members: FetchedMember[],
  payments: FetchedPayment[],
  draws: FetchedDraw[],
  me: string | undefined,
  now: number
): CircleFacts {
  const myMember = me ? members.find((m) => m.walletAddress === me) : undefined;
  const stakePool = pool.stakeEnabled !== false;
  const stakeEach = stakePool ? pool.monthlyAmount * (pool.stakeMultiplier || 1) : 0;
  const seated = members.filter((m) => !m.isKicked);
  const paid = new Set(payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress));
  const isPaid = (m: FetchedMember) => paid.has(m.walletAddress);
  const active = pool.status === "active";

  // The same rule the auto-draw scheduler follows (round-settlement.ts), over the whole roster
  const settled = settleRound(
    members.map((m) => ({
      wallet: m.walletAddress,
      paid: isPaid(m),
      isKicked: m.isKicked,
      inGracePeriod: m.inGracePeriod,
      inDefault: m.inDefault,
      graceDeadline: m.graceDeadline ? seconds(m.graceDeadline) : 0,
    })),
    { nowSec: now / 1000, marginSec: 60 }
  );

  // Auto circles give the server's per-minute cron the first go at the draw
  const drawDue = active && now > pool.nextDrawDate.getTime() + (pool.autoMode ? 2 : 1) * DRAW_GRACE_MS;
  const committed = active && pool.randomnessRound === pool.currentRound && pool.currentRound > 0;
  const toMark = drawDue ? seated.filter((m) => settled.toMark.includes(m.walletAddress)) : [];
  const toKick = toMark.filter((m) => settled.toKick.includes(m.walletAddress));
  const canWin = (m: FetchedMember) => !m.hasWon && !m.inDefault && !m.inGracePeriod;
  // A marked seat can't win; if the unpaid seats are the only ones left to win, marking them
  // stalls the round (and removing them later locks the circle). Wait for them to pay.
  const markLeavesNoWinner = toMark.length > 0 && seated.filter((m) => canWin(m) && !toMark.includes(m)).length === 0;
  const waitingOn = members.filter((m) => settled.waiting.includes(m.walletAddress));
  const eligible = seated.filter((m) => !m.hasWon && !m.inDefault && !m.inGracePeriod).length;
  const canDraw = drawDue && !committed && waitingOn.length === 0 && eligible > 0;

  const staked = stakePool ? members.filter((m) => m.stakeDeposited).length : members.length;
  const memberCount = pool.memberCount ?? seated.length;

  return {
    me,
    myMember,
    isAuthority: !!me && me === pool.creatorId,
    stakePool,
    stakeEach,
    seated,
    paid,
    paidCount: seated.filter(isPaid).length,
    staked,
    joined: members.length,
    full: members.length >= pool.maxMembers,
    pot: pool.monthlyAmount * (pool.status === "pending" ? pool.maxMembers : memberCount),
    drawDue,
    committed,
    toMark,
    toKick,
    pastDeadline: active && now > pool.nextDrawDate.getTime(),
    uncovered: active ? settled.waiting.length : 0,
    markLeavesNoWinner,
    waitingOn,
    eligible,
    canDraw,
    unclaimedWin: draws.find((d) => d.winnerAddress === me && !d.claimed),
    refundable:
      pool.status === "completed" && !!myMember?.stakeDeposited && (myMember.stakeAmount ?? 0) > 0,
    stakesLeft:
      pool.status === "completed"
        ? members.filter((m) => m.walletAddress !== me && m.stakeDeposited && m.stakeAmount > 0)
        : [],
    rejoinCost: myMember?.isKicked ? stakeEach + (myMember.missedRounds || 0) * pool.monthlyAmount : 0,
  };
}

/** The one main thing the viewer can do on a circle, in priority order. */
export type CircleAction =
  | { kind: "connect" }
  | { kind: "claim"; draw: FetchedDraw }
  | { kind: "join" }
  | { kind: "stake" }
  | { kind: "start"; ready: boolean }
  | { kind: "waiting" }
  | { kind: "finish" }
  | { kind: "finishLater" }
  | { kind: "rejoin" }
  | { kind: "restake" }
  | { kind: "blocked" }
  | { kind: "pay" }
  | { kind: "mark" }
  | { kind: "draw" }
  | { kind: "paid" }
  | { kind: "closed" }
  | { kind: "refund" }
  | { kind: "returnAll" }
  | { kind: "complete" };

export function circleAction(pool: FetchedPool, f: CircleFacts, connected: boolean): CircleAction {
  if (!connected) return { kind: "connect" };
  if (f.unclaimedWin) return { kind: "claim", draw: f.unclaimedWin };
  const m = f.myMember;

  if (pool.status === "pending") {
    if (!m) return { kind: "join" };
    if (f.stakePool && !m.stakeDeposited) return { kind: "stake" };
    if (f.isAuthority) return { kind: "start", ready: f.full && f.staked >= f.joined };
    return { kind: "waiting" };
  }

  if (pool.status === "active") {
    if (m?.isKicked) return { kind: "rejoin" };
    if (m && f.stakePool && !m.stakeDeposited) return { kind: m.inGracePeriod ? "restake" : "blocked" };
    // The program finishes a draw only once every seat has paid, yours included: pay first
    if (m && !f.paid.has(m.walletAddress)) return { kind: "pay" };
    // A started draw locks the circle if nobody finishes it within 512 slots. The program
    // lets the host finish at any time and everyone else once the deadline has passed.
    if (f.committed) return { kind: f.pastDeadline || f.isAuthority ? "finish" : "finishLater" };
    if ((m || f.isAuthority) && f.toMark.length > 0 && !f.markLeavesNoWinner) return { kind: "mark" };
    if ((m || f.isAuthority) && f.canDraw) return { kind: "draw" };
    return m ? { kind: "paid" } : { kind: "closed" };
  }

  if (f.refundable) return { kind: "refund" };
  if (f.stakesLeft.length > 0) return { kind: "returnAll" };
  return { kind: "complete" };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
