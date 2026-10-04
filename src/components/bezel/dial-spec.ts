import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";

/** What the dial shows. Seat indexes are 0-based roster positions. */
export interface DialSpec {
  seats: number;
  mode: "pending" | "active" | "complete";
  /** Paid this round (active circles). */
  paid?: number[];
  /** Stake deposited (circles that haven't started). */
  staked?: number[];
  /** Took a pot in an earlier round. */
  won?: number[];
  /** Missed a payment and is in the grace period. */
  late?: number[];
  /** Seats nobody has taken yet. */
  open?: number[];
  /** Your seat, or -1. */
  you?: number;
  /** Current round, 1-based. */
  round?: number;
  /** Hide the coin to show the empty bezel (empty and error states). */
  coin?: boolean;
}

export type MarkState = "open" | "taken" | "lit" | "won" | "late";

export function markState(spec: DialSpec, i: number): MarkState {
  if (spec.open?.includes(i)) return "open";
  if (spec.mode === "complete" || spec.won?.includes(i)) return "won";
  if (spec.late?.includes(i)) return "late";
  if (spec.mode === "pending") return spec.staked?.includes(i) ? "lit" : "taken";
  return spec.paid?.includes(i) ? "lit" : "taken";
}

export const EMPTY_DIAL: DialSpec = { seats: 6, mode: "pending", open: [0, 1, 2, 3, 4, 5], coin: false };

/** Derive the dial from what the pool page already loads. No extra reads. */
export function dialFromPool(
  pool: FetchedPool,
  members: FetchedMember[],
  payments: FetchedPayment[],
  _draws: FetchedDraw[],
  me?: string
): DialSpec {
  const seats = Math.max(pool.maxMembers, members.length);
  const ordered = members.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const seatOf = new Map<string, number>();
  ordered.forEach((m, i) => seatOf.set(m.walletAddress, i));
  const at = (pick: (m: FetchedMember) => boolean) => ordered.flatMap((m, i) => (pick(m) ? [i] : []));
  const paidNow = new Set(payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress));
  const mode: DialSpec["mode"] = pool.status === "pending" ? "pending" : pool.status === "active" ? "active" : "complete";
  return {
    seats,
    mode,
    open: Array.from({ length: Math.max(0, seats - ordered.length) }, (_, k) => ordered.length + k),
    staked: at((m) => m.stakeDeposited),
    paid: at((m) => paidNow.has(m.walletAddress)),
    won: at((m) => m.hasWon),
    late: at((m) => m.inGracePeriod || m.inDefault),
    you: me && seatOf.has(me) ? seatOf.get(me)! : -1,
    round: Math.max(1, pool.currentRound),
  };
}

/** The list-row dial for a pool when members aren't loaded (Home list). */
export function dialFromPoolOnly(pool: FetchedPool): DialSpec {
  const mode: DialSpec["mode"] = pool.status === "pending" ? "pending" : pool.status === "active" ? "active" : "complete";
  return { seats: pool.maxMembers, mode, round: Math.max(1, pool.currentRound), you: -1 };
}
