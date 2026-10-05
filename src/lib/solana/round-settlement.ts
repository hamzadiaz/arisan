/**
 * Who must be marked before a round can be drawn, and who still holds the draw.
 * Shared by the circle screen and the auto-draw scheduler so both follow one rule.
 *
 * The program pays contribution × member_count whether or not everyone paid. A seat that
 * missed the round is covered only by its own slashed stake, and only for the round it was
 * marked in. So once the deadline has passed:
 * - unpaid, and not in grace (or its grace has expired): mark it. mark_defaulter slashes the
 *   stake and starts grace, or kicks the seat (member_count - 1) when grace is over.
 * - unpaid, in a grace that started after this round's deadline, stake slashed: covered.
 * - unpaid, in grace from an earlier round: nothing covers its share, so the draw waits until
 *   it pays or its grace expires.
 */
export interface SeatState {
  wallet: string;
  /** A Payment account exists for the current round */
  paid: boolean;
  isKicked: boolean;
  inGracePeriod: boolean;
  inDefault: boolean;
  /** Unix seconds; 0 when not in grace */
  graceDeadline: number;
}

export interface RoundRules {
  nowSec: number;
  /** The round's next_draw_timestamp */
  deadlineSec: number;
  gracePeriodSeconds: number;
  stakeEnabled: boolean;
  /** Seconds a grace must be past its deadline before it counts as over (device clocks drift). */
  marginSec?: number;
}

export function settleRound(seats: SeatState[], rules: RoundRules) {
  const seated = seats.filter((s) => !s.isKicked);
  const graceOver = (s: SeatState) => s.graceDeadline > 0 && rules.nowSec > s.graceDeadline + (rules.marginSec ?? 0);
  // mark_defaulter only runs after the deadline, so a grace that began after this round's
  // deadline was begun for this round.
  const markedThisRound = (s: SeatState) => s.inGracePeriod && s.graceDeadline - rules.gracePeriodSeconds > rules.deadlineSec;
  const markable = (s: SeatState) => !s.paid && (!s.inGracePeriod || graceOver(s));
  const covered = (s: SeatState) => s.paid || (rules.stakeEnabled && s.inDefault && markedThisRound(s));
  return {
    /** Seats to mark now (only meaningful once the deadline has passed) */
    toMark: seated.filter(markable).map((s) => s.wallet),
    /** The part of toMark whose grace is over: marking removes these seats */
    toKick: seated.filter((s) => markable(s) && s.inGracePeriod).map((s) => s.wallet),
    /** Unpaid seats nothing covers: the draw waits for them */
    waiting: seated.filter((s) => !covered(s) && !markable(s)).map((s) => s.wallet),
  };
}
