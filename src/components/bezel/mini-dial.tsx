import { cn } from "@/lib/utils";
import { type DialSpec, markState } from "./dial-spec";
import { EMBLEM_COMPACT, emblemSegments, segmentsToPath } from "./emblem";

// The dial as SVG: list rows, previews, and the poster/fallback for the 3D dial.
// Same states as the 3D marks: open (hollow), taken (dark), lit (lume), won (gold), late (signal).

const C = 24;
const EMBLEM = segmentsToPath(
  emblemSegments({ rings: EMBLEM_COMPACT.rings.map((r) => (r * 7.4) / 24), gaps: EMBLEM_COMPACT.gaps, walls: [] }, C, C)
);

const FILL = { taken: "var(--dial-mark-off)", lit: "#5cf2b6", won: "#ebc86a", late: "#ff7a5c" } as const;

export function MiniDial({ spec, light = false, className }: { spec: DialSpec; light?: boolean; className?: string }) {
  const n = spec.seats;
  const r = n > 12 ? 1.25 : 1.75;
  const coin = spec.coin !== false;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={cn("block", className)}>
      <circle cx="24" cy="24" r="19.2" fill="none" stroke={`url(#${light ? "bz-glass-light" : "bz-glass"})`} strokeWidth="6.4" opacity={0.95} />
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="rgba(190,255,225,.22)" strokeWidth=".5" />
      <path d="M8.6 15.6A17.6 17.6 0 0 1 18.4 6.6" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity={0.5} />
      {coin ? (
        <>
          <circle cx="24" cy="24" r="15.3" fill="url(#bz-coin)" />
          <circle cx="24" cy="24" r="14.3" fill="none" stroke="url(#bz-rim)" strokeWidth="1.3" />
          <path d={EMBLEM} fill="none" stroke="#7a5418" strokeOpacity={0.7} strokeWidth=".95" strokeLinecap="square" />
          <path d="M24 21.9l2.1 2.1-2.1 2.1-2.1-2.1z" fill="url(#bz-gem)" />
        </>
      ) : (
        <circle cx="24" cy="24" r="15.3" fill="var(--dial-case)" />
      )}
      {Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = +(C + 19.2 * Math.cos(a)).toFixed(2);
        const y = +(C + 19.2 * Math.sin(a)).toFixed(2);
        const st = markState(spec, i);
        if (st === "open") {
          return <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="var(--dial-mark-open)" strokeWidth=".6" />;
        }
        return (
          <g key={i}>
            {st === "lit" && <circle cx={x} cy={y} r={r + 1.4} fill="#5cf2b6" opacity={0.35} />}
            <circle cx={x} cy={y} r={r} fill={FILL[st]} />
            {i === spec.you && <circle cx={x} cy={y} r={r + 1.3} fill="none" stroke="#f1da92" strokeWidth=".7" />}
          </g>
        );
      })}
    </svg>
  );
}
