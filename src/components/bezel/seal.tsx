import { cn } from "@/lib/utils";
import { EMBLEM_COMPACT, EMBLEM_SEAL, emblemSegments, segmentsToPath } from "./emblem";

// The Arisan seal: Hamza's end-card coin redrawn as vectors. Hammered gold, the maze emblem,
// a square emerald, and the emerald glass ring with six seats. `compact` drops the seats and
// thickens the lines for 16–48 px. Gradients live once in <BezelDefs/>.

const C = 64;
const PATH_FULL = segmentsToPath(emblemSegments(EMBLEM_SEAL, C, C));
const PATH_COMPACT = segmentsToPath(emblemSegments(EMBLEM_COMPACT, C, C));
const SEATS = Array.from({ length: 6 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 3;
  return [+(C + 53 * Math.cos(a)).toFixed(2), +(C + 53 * Math.sin(a)).toFixed(2)];
});

export function Seal({ compact = false, light = false, className, title }: { compact?: boolean; light?: boolean; className?: string; title?: string }) {
  const d = compact ? PATH_COMPACT : PATH_FULL;
  const sw = compact ? 3.6 : 2.6;
  const g = compact ? [55.5, 72.5] : [57.2, 70.8];
  return (
    <svg viewBox="0 0 128 128" className={cn("block", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx="64" cy="64" r="53" fill="none" stroke={`url(#${light ? "bz-band-light" : "bz-band"})`} strokeWidth={compact ? 18 : 16} />
      <circle cx="64" cy="64" r="53" fill="none" stroke={`url(#${light ? "bz-glass-light" : "bz-glass"})`} strokeWidth={compact ? 18 : 16} opacity={0.55} />
      <circle cx="64" cy="64" r={compact ? 62.4 : 61.2} fill="none" stroke="rgba(200,255,230,.32)" strokeWidth="1" />
      {!compact && <circle cx="64" cy="64" r="62.6" fill="none" stroke="url(#bz-rim)" strokeWidth="1.4" opacity={0.9} />}
      <circle cx="64" cy="64" r={compact ? 43.6 : 44.8} fill="none" stroke="rgba(10,40,28,.55)" strokeWidth="1.2" />
      <path d="M22 44A46 46 0 0 1 52 16" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity={0.55} />
      <path d="M100 96A46 46 0 0 1 86 108" fill="none" stroke="#e6fff4" strokeWidth="1.6" strokeLinecap="round" opacity={0.35} />
      <circle cx="64" cy="64" r="43" fill="url(#bz-coin)" filter={compact ? undefined : "url(#bz-hammer)"} />
      <circle cx="64" cy="64" r="40.6" fill="none" stroke="url(#bz-rim)" strokeWidth={compact ? 4 : 3.2} />
      <circle cx="64" cy="64" r={compact ? 37.4 : 38.2} fill="none" stroke="rgba(105,70,18,.42)" strokeWidth=".9" />
      <path d={d} fill="none" stroke="#6b4812" strokeOpacity={0.78} strokeWidth={sw} strokeLinecap="square" transform="translate(.7 .9)" />
      <path d={d} fill="none" stroke="#fff1c8" strokeOpacity={0.85} strokeWidth={sw} strokeLinecap="square" />
      <path d={d} fill="none" stroke="#e7c264" strokeWidth={+(sw * 0.62).toFixed(2)} strokeLinecap="square" transform="translate(.25 .35)" />
      <path d={`M64 ${g[0]}L${g[1]} 64L64 ${g[1]}L${g[0]} 64Z`} fill="url(#bz-gem)" stroke="#0b5c3c" strokeWidth=".8" />
      <path d="M61.6 61.4l2.4-2.4" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity={0.8} />
      {!compact &&
        SEATS.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="5" fill="#5cf2b6" opacity={0.55} filter="url(#bz-glow)" />
            <circle cx={x} cy={y} r="2.7" fill="#7dffc8" />
            <circle cx={x} cy={y} r="3.6" fill="none" stroke="#f1da92" strokeWidth=".8" opacity={0.85} />
          </g>
        ))}
    </svg>
  );
}

/** Gradients and filters shared by every Seal and MiniDial. Render once, near the root. */
export function BezelDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <radialGradient id="bz-coin" cx="38%" cy="32%" r="78%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".2" stopColor="#f4d68a" />
          <stop offset=".55" stopColor="#d9b04f" />
          <stop offset=".82" stopColor="#a97e2c" />
          <stop offset="1" stopColor="#7a5717" />
        </radialGradient>
        <linearGradient id="bz-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset=".45" stopColor="#e2bd62" />
          <stop offset=".7" stopColor="#9e7426" />
          <stop offset="1" stopColor="#f0d38a" />
        </linearGradient>
        <linearGradient id="bz-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9df7d2" />
          <stop offset=".28" stopColor="#2fc18b" />
          <stop offset=".62" stopColor="#127a55" />
          <stop offset="1" stopColor="#0b4a34" />
        </linearGradient>
        <linearGradient id="bz-glass-light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bff8e0" />
          <stop offset=".3" stopColor="#3fcf98" />
          <stop offset=".65" stopColor="#169064" />
          <stop offset="1" stopColor="#0e5a3f" />
        </linearGradient>
        <radialGradient id="bz-band" gradientUnits="userSpaceOnUse" cx="64" cy="64" r="62">
          <stop offset=".7" stopColor="#05301f" />
          <stop offset=".75" stopColor="#0d6646" />
          <stop offset=".84" stopColor="#2bc58c" />
          <stop offset=".91" stopColor="#7bebc2" />
          <stop offset=".96" stopColor="#1a9a6b" />
          <stop offset="1" stopColor="#0b4a33" />
        </radialGradient>
        <radialGradient id="bz-band-light" gradientUnits="userSpaceOnUse" cx="64" cy="64" r="62">
          <stop offset=".7" stopColor="#0d5a3e" />
          <stop offset=".75" stopColor="#17855c" />
          <stop offset=".84" stopColor="#3fd29a" />
          <stop offset=".91" stopColor="#a6f3d6" />
          <stop offset=".96" stopColor="#2aae7c" />
          <stop offset="1" stopColor="#11694a" />
        </radialGradient>
        <radialGradient id="bz-gem" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#d6ffef" />
          <stop offset=".35" stopColor="#3fe3a4" />
          <stop offset="1" stopColor="#0a6a45" />
        </radialGradient>
        <filter id="bz-hammer" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.32" numOctaves={2} seed={4} result="n" />
          <feDiffuseLighting in="n" lightingColor="#ffffff" surfaceScale={1.6} result="lit">
            <feDistantLight azimuth={225} elevation={52} />
          </feDiffuseLighting>
          <feComponentTransfer in="lit" result="soft">
            <feFuncR type="linear" slope={0.5} intercept={0.58} />
            <feFuncG type="linear" slope={0.5} intercept={0.58} />
            <feFuncB type="linear" slope={0.5} intercept={0.58} />
          </feComponentTransfer>
          <feComposite in="soft" in2="SourceGraphic" operator="in" result="mask" />
          <feBlend in="SourceGraphic" in2="mask" mode="multiply" />
        </filter>
        <filter id="bz-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
    </svg>
  );
}
