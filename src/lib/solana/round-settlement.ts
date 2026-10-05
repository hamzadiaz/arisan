/**
 * Who can be marked after a round's deadline, and who still holds the draw.
 * Shared by the circle screen and the auto-draw scheduler so both follow one rule.
 *
 * The program draws only when every seat on the roster has paid this round: execute_draw
 * checks each seat's Payment account, removed seats included, and a removed seat can only
 * pay by rejoining. Marking after the deadline is a penalty, not a way round it: it slashes
 * the stake and starts a 48-hour grace, or removes the seat once that grace is over.
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
  /** Seconds a grace must be past its deadline before it counts as over (device clocks drift). */
  marginSec?: number;
}

export function settleRound(seats: SeatState[], rules: RoundRules) {
  const seated = seats.filter((s) => !s.isKicked);
  const graceOver = (s: SeatState) => s.graceDeadline > 0 && rules.nowSec > s.graceDeadline + (rules.marginSec ?? 0);
  const markable = (s: SeatState) => !s.paid && (!s.inGracePeriod || graceOver(s));
  return {
    /** Seats to mark now (only meaningful once the deadline has passed) */
    toMark: seated.filter(markable).map((s) => s.wallet),
    /** The part of toMark whose grace is over: marking removes these seats */
    toKick: seated.filter((s) => markable(s) && s.inGracePeriod).map((s) => s.wallet),
    /** Every unpaid seat, removed ones included: the draw waits for all of them */
    waiting: seats.filter((s) => !s.paid).map((s) => s.wallet),
  };
}
