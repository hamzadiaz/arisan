import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { formatAmount, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { orderedSeats } from "./dial-spec";
import { Dot, Status } from "./kit";

// The circle screen's two tabs. Both read only what the page already loads
// (pool, members, payments, draws), so the page keeps its three program reads.

const pad = (n: number) => String(n).padStart(2, "0");

export function SeatList({ pool, members, payments, me }: { pool: FetchedPool; members: FetchedMember[]; payments: FetchedPayment[]; me?: string }) {
  const paidNow = new Set(payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress));
  const seats = orderedSeats(members);
  const open = Math.max(0, pool.maxMembers - seats.length);
  return (
    <ul className="divide-y divide-border">
      {seats.map((m, i) => {
        const mine = m.walletAddress === me;
        const paid = paidNow.has(m.walletAddress);
        // A missed payment outranks a past win: it is the seat's open risk.
        const note = m.isKicked
          ? { text: m.missedRounds > 0 ? `Removed · missed ${m.missedRounds === 1 ? "a round" : `${m.missedRounds} rounds`}` : "Removed", tone: "signal" as const }
          : m.inGracePeriod || m.inDefault
            ? { text: m.hasWon ? `Missed a payment · took round ${m.wonRound}` : "Missed a payment", tone: "signal" as const }
            : m.hasWon
              ? { text: `Took round ${m.wonRound}`, tone: "gold" as const }
              : null;
        return (
          <li key={m.id} className="grid h-[54px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3">
            <span className="font-label text-[10px] text-muted-foreground">{pad(i + 1)}</span>
            <span className="min-w-0">
              <span className={cn("flex items-center gap-2", mine ? "text-[15px] font-semibold" : "font-mono text-[14px]")}>
                {mine ? "You" : shortAddress(m.walletAddress)}
                {m.walletAddress === pool.creatorId && <span className="bz-tag">Host</span>}
              </span>
              {note && (
                <span className={cn("mt-0.5 block truncate text-[12px]", note.tone === "gold" ? "text-gold-hi" : note.tone === "signal" ? "text-signal" : "text-muted-foreground")}>
                  {note.text}
                </span>
              )}
            </span>
            {pool.status === "active" ? (
              m.isKicked ? (
                <Status tone="off">Out</Status>
              ) : (
                <Status tone={paid ? "paid" : "due"} strong={!paid}>
                  {paid ? "Paid" : "Due"}
                </Status>
              )
            ) : pool.status === "pending" && pool.stakeEnabled !== false ? (
              <Status tone={m.stakeDeposited ? "paid" : "off"}>{m.stakeDeposited ? "Staked" : "No stake"}</Status>
            ) : (
              <span />
            )}
          </li>
        );
      })}
      {Array.from({ length: open }, (_, k) => (
        <li key={`open-${k}`} className="grid h-[54px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3">
          <span className="font-label text-[10px] text-muted-foreground">{pad(seats.length + k + 1)}</span>
          <span className="text-[14px] text-muted-foreground">Open seat</span>
          <span />
        </li>
      ))}
    </ul>
  );
}

type Cell = "paid" | "won" | "due" | "miss" | "next" | "out";
const CELL_TEXT: Record<Cell, string> = {
  paid: "paid",
  won: "took the pot",
  due: "due",
  miss: "missed",
  next: "not yet",
  out: "removed",
};

export function HistoryGrid({ pool, members, payments, draws, me }: { pool: FetchedPool; members: FetchedMember[]; payments: FetchedPayment[]; draws: FetchedDraw[]; me?: string }) {
  const rounds = Math.max(1, pool.durationMonths || pool.maxMembers);
  const seats = orderedSeats(members);
  const paid = new Set(payments.map((p) => `${p.round}:${p.walletAddress}`));
  const winner = new Map(draws.map((d) => [d.round, d.winnerAddress]));
  const now = pool.status === "active" ? pool.currentRound : pool.status === "completed" ? rounds + 1 : 0;
  const cell = (m: FetchedMember, r: number): Cell => {
    if (winner.get(r) === m.walletAddress) return "won";
    if (paid.has(`${r}:${m.walletAddress}`)) return "paid";
    if (m.isKicked && r >= now) return "out";
    if (r === now) return "due";
    if (r < now) return "miss";
    return "next";
  };
  return (
    <div className="overflow-x-auto rounded-[14px]" tabIndex={0} role="region" aria-label="Payment history, scrolls sideways">
      <div
        role="table"
        aria-label="Payments by round"
        className="bz-history"
        style={{ gridTemplateColumns: `108px repeat(${rounds}, minmax(34px, 1fr))`, minWidth: 108 + rounds * 34 }}
      >
        <div role="row" className="contents">
          <span role="columnheader" className="bz-h bz-seat">
            Seat
          </span>
          {Array.from({ length: rounds }, (_, r) => (
            <span key={r} role="columnheader" className={cn("bz-h", r + 1 === now && "bz-h-now")}>
              <span aria-hidden="true">R{r + 1}</span>
              <span className="sr-only">Round {r + 1}</span>
            </span>
          ))}
        </div>
        {seats.map((m, i) => (
          <div role="row" key={m.id} className="contents">
            <span role="rowheader" className="bz-seat">
              <em className="font-label text-[10px] not-italic text-muted-foreground">{pad(i + 1)}</em>
              <span className={cn("truncate", m.walletAddress === me && "font-sans text-[13px] font-semibold")}>
                {m.walletAddress === me ? "You" : shortAddress(m.walletAddress)}
              </span>
            </span>
            {Array.from({ length: rounds }, (_, r) => {
              const state = cell(m, r + 1);
              return (
                <span key={r} role="cell" className={cn(r + 1 === now && "bz-now")}>
                  <i aria-hidden="true" className={cn("bz-g", `bz-g-${state}`)} />
                  <span className="sr-only">{CELL_TEXT[state]}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <i className="bz-g bz-g-paid" />
          paid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="bz-g bz-g-won" />
          took the pot
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="bz-g bz-g-due" />
          due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="bz-g bz-g-miss" />
          missed
        </span>
      </p>
    </div>
  );
}

/** The last result, shown once a round has been drawn. */
export function LastDraw({ draw, me, currency }: { draw: FetchedDraw; me?: string; currency: string }) {
  const mine = draw.winnerAddress === me;
  return (
    <div className={cn("bz-note mt-4", mine && "bz-note-gold")}>
      <Dot tone="won" />
      <div>
        {mine ? <b>You took round {draw.round}</b> : <><b className="font-mono font-semibold">{shortAddress(draw.winnerAddress)}</b> took round {draw.round}</>}
        <span className="tabular-nums"> · {formatAmount(draw.amount, currency)}</span>
      </div>
    </div>
  );
}
