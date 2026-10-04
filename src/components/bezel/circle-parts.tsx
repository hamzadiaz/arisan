import type { FetchedDraw, FetchedMember, FetchedPayment, FetchedPool } from "@/lib/solana/accounts";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dot, Status } from "./kit";

// The circle screen's two tabs. Both read only what the page already loads
// (pool, members, payments, draws), so the page keeps its three program reads.

const ordered = (members: FetchedMember[]) => members.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
const pad = (n: number) => String(n).padStart(2, "0");

export function SeatList({ pool, members, payments, me }: { pool: FetchedPool; members: FetchedMember[]; payments: FetchedPayment[]; me?: string }) {
  const paidNow = new Set(payments.filter((p) => p.round === pool.currentRound).map((p) => p.walletAddress));
  const seats = ordered(members);
  const open = Math.max(0, pool.maxMembers - seats.length);
  return (
    <ul className="divide-y divide-border">
      {seats.map((m, i) => {
        const mine = m.walletAddress === me;
        const note = m.isKicked
          ? { text: "Removed", tone: "signal" as const }
          : m.hasWon
            ? { text: `Took round ${m.wonRound}`, tone: "gold" as const }
            : m.inGracePeriod || m.inDefault
              ? { text: "Missed a payment", tone: "signal" as const }
              : pool.status === "pending" && pool.stakeEnabled !== false && !m.stakeDeposited
                ? { text: "Stake pending", tone: undefined }
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
                <span className={cn("mt-0.5 block text-[12px]", note.tone === "gold" ? "text-gold-hi" : note.tone === "signal" ? "text-signal" : "text-muted-foreground")}>
                  {note.text}
                </span>
              )}
            </span>
            {pool.status === "active" ? (
              <Status tone={paidNow.has(m.walletAddress) ? "paid" : "due"} strong={!paidNow.has(m.walletAddress)}>
                {paidNow.has(m.walletAddress) ? "Paid" : "Due"}
              </Status>
            ) : pool.status === "pending" && pool.stakeEnabled !== false ? (
              <Status tone={m.stakeDeposited ? "paid" : "off"}>{m.stakeDeposited ? "Staked" : "No stake"}</Status>
            ) : (
              <span />
            )}
          </li>
        );
      })}
      {Array.from({ length: open }, (_, k) => (
        <li key={`open-${k}`} className="grid h-[54px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 text-quiet">
          <span className="font-label text-[10px]">{pad(seats.length + k + 1)}</span>
          <span className="text-[14px]">Open seat</span>
          <span />
        </li>
      ))}
    </ul>
  );
}

type Cell = "paid" | "won" | "due" | "miss" | "next";

export function HistoryGrid({ pool, members, payments, draws, me }: { pool: FetchedPool; members: FetchedMember[]; payments: FetchedPayment[]; draws: FetchedDraw[]; me?: string }) {
  const rounds = Math.max(1, pool.durationMonths || pool.maxMembers);
  const seats = ordered(members);
  const paid = new Set(payments.map((p) => `${p.round}:${p.walletAddress}`));
  const winner = new Map(draws.map((d) => [d.round, d.winnerAddress]));
  const now = pool.status === "active" ? pool.currentRound : pool.status === "completed" ? rounds + 1 : 0;
  const cell = (m: FetchedMember, r: number): Cell => {
    if (winner.get(r) === m.walletAddress) return "won";
    if (paid.has(`${r}:${m.walletAddress}`)) return "paid";
    if (r === now) return "due";
    if (r < now) return "miss";
    return "next";
  };
  return (
    <div className="overflow-x-auto rounded-[14px]">
      <div className="bz-history" style={{ gridTemplateColumns: `86px repeat(${rounds}, minmax(34px, 1fr))`, minWidth: 86 + rounds * 34 }}>
        <span className="bz-h bz-seat">Seat</span>
        {Array.from({ length: rounds }, (_, r) => (
          <span key={r} className={cn("bz-h", r + 1 === now && "bz-h-now")}>
            R{r + 1}
          </span>
        ))}
        {seats.map((m, i) => (
          <Row key={m.id} label={m.walletAddress === me ? "You" : shortAddress(m.walletAddress)} index={i + 1}>
            {Array.from({ length: rounds }, (_, r) => (
              <span key={r} className={cn(r + 1 === now && "bz-now")}>
                <i aria-label={cell(m, r + 1)} className={cn("bz-g", `bz-g-${cell(m, r + 1)}`)} />
              </span>
            ))}
          </Row>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
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

function Row({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <>
      <span className="bz-seat">
        <em className="font-label text-[10px] not-italic text-muted-foreground">{pad(index)}</em>
        <span className={label === "You" ? "font-sans text-[13px] font-semibold" : ""}>{label}</span>
      </span>
      {children}
    </>
  );
}

/** The last result, shown once a round has been drawn. */
export function LastDraw({ draw, me, currency }: { draw: FetchedDraw; me?: string; currency: string }) {
  const mine = draw.winnerAddress === me;
  return (
    <div className={cn("bz-note mt-4", mine && "bz-note-gold")}>
      <Dot tone="won" />
      <div>
        <b>{mine ? "You took the pot" : `${shortAddress(draw.winnerAddress)} took the pot`}</b> in round {draw.round}:{" "}
        <span className="font-mono">
          {draw.amount} {currency}
        </span>
      </div>
    </div>
  );
}
