/**
 * Who can be marked after a round's deadline, and who still holds the draw.
 * Shared by the circle screen and the auto-draw scheduler so both follow one rule.
 *
 * The program draws only when every seat still in has paid this round: execute_draw checks
 * each seat's Payment account and skips removed seats, which can't pay and aren't in the pot.
 * Marking after the deadline slashes the stake and starts a 48-hour grace, during which the
 * draw still waits; once that grace is over, marking removes the seat and the draw goes on.
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
  hasWon: boolean;
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
  const canWin = (s: SeatState) => !s.hasWon && !s.inDefault && !s.inGracePeriod;
  // A marked seat can't win this round, and a removed one is out for good. When the unpaid
  // seats are the only ones left that can win, the ones yet to win are spared: removing them
  // would leave rounds nobody can take, so the round waits for them to pay.
  const lastToWin = !seated.some((s) => canWin(s) && !markable(s));
  const spare = (s: SeatState) => lastToWin && !s.hasWon;
  const marked = seated.filter((s) => markable(s) && !spare(s));
  return {
    /** Seats to mark now (only meaningful once the deadline has passed) */
    toMark: marked.map((s) => s.wallet),
    /** The part of toMark whose grace is over: marking removes these seats */
    toKick: marked.filter((s) => s.inGracePeriod).map((s) => s.wallet),
    /** Missed seats left unmarked because they're the last ones that can win */
    spared: seated.filter((s) => markable(s) && spare(s)).map((s) => s.wallet),
    /** Unpaid seats still in: the draw waits for all of them */
    waiting: seated.filter((s) => !s.paid).map((s) => s.wallet),
  };
}
