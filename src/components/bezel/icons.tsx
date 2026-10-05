import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

// One icon set for the whole app: 24px grid, 1.6 stroke, round caps.
// Shapes come from the dial (r 8.4–8.6 rings, short ticks, the emblem pentagon).
// `fill-on` parts fill at 22% when an ancestor is active (see globals.css).

const SEAT_DOTS: [number, number][] = [
  [12, 3.4],
  [19.45, 7.7],
  [19.45, 16.3],
  [12, 20.6],
  [4.55, 16.3],
  [4.55, 7.7],
];

const PATHS = {
  // Home is your circles: the coin with its pentagon emblem
  home: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path className="fill-on" d="M12 7.2l4.6 3.3-1.75 5.4h-5.7L7.4 10.5z" />
    </>
  ),
  create: (
    <>
      <circle className="fill-on" cx="12" cy="12" r="8.4" />
      <path d="M12 8.1v7.8M8.1 12h7.8" />
    </>
  ),
  // Join is an invite: a ticket with its code and a tear line
  join: (
    <>
      <path
        className="fill-on"
        d="M4.6 6h14.8a1.6 1.6 0 0 1 1.6 1.6v2.6a1.8 1.8 0 0 0 0 3.6v2.6a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 16.4v-2.6a1.8 1.8 0 0 0 0-3.6V7.6A1.6 1.6 0 0 1 4.6 6z"
      />
      <path d="M7.6 12h.01M10.4 12h.01M13.2 12h.01" strokeWidth={2.4} />
      <path d="M16.8 8.6v6.8" strokeDasharray="1.1 1.7" />
    </>
  ),
  history: (
    <>
      <rect x="3.8" y="4.8" width="16.4" height="14.6" rx="2.2" />
      <path d="M3.8 9.4h16.4M9 4.8v14.6M12.6 13.2v.1M16.2 13.2v.1M12.6 16.3v.1" />
    </>
  ),
  draw: (
    <>
      <circle cx="12" cy="12.6" r="7.8" strokeDasharray="1.9 2.4" />
      <path className="icon-solid" d="M12 1.4l-2 3.2h4z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="6.3" strokeOpacity={0.45} />
      <path d="M12 8.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" />
    </>
  ),
  // Hollow seats round a table: solid dots round a disc read as the sun at 16px
  seats: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      {SEAT_DOTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.75" strokeWidth={1.3} />
      ))}
    </>
  ),
  wallet: (
    <>
      <rect x="3.2" y="6.6" width="17.6" height="12.8" rx="2.6" />
      <path d="M16.6 6.6V5.3a1.4 1.4 0 0 0-1.8-1.3L5.4 6.6" />
      <circle className="icon-solid" cx="16.4" cy="13" r="1.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.4" width="14" height="9.8" rx="2.4" />
      <path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4M12 14.2v2.2" />
    </>
  ),
  crown: <path d="M4.6 18.4h14.8M5.2 15.8 4.2 7.9l4.7 3.6L12 5.7l3.1 5.8 4.7-3.6-1 7.9z" />,
  person: (
    <>
      <circle cx="12" cy="8.6" r="3.5" />
      <path d="M5.2 19.8c1-3.5 3.7-5.4 6.8-5.4s5.8 1.9 6.8 5.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.1 2" />
    </>
  ),
  back: <path d="M14.6 5.4 8 12l6.6 6.6" />,
  chev: <path d="M9.4 5.6 15.8 12l-6.4 6.4" />,
  close: <path d="M6.6 6.6l10.8 10.8M17.4 6.6 6.6 17.4" />,
  plus: <path d="M12 5.4v13.2M5.4 12h13.2" />,
  minus: <path d="M5.4 12h13.2" />,
  check: <path d="M5.2 12.7l4.3 4.2 9.3-9.7" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.6v5.2M12 16.3v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4M12 7.7v.1" />
    </>
  ),
  offline: <path d="M5 9.7a10 10 0 0 1 14 0M8 12.8a5.7 5.7 0 0 1 8 0M10.9 15.9a1.7 1.7 0 0 1 2.2 0M4 4l16 16" />,
  refresh: (
    <>
      <path d="M19.3 12.4a7.4 7.4 0 1 1-2.1-5.6" />
      <path d="M19.5 4.3v4.4h-4.4" />
    </>
  ),
  copy: (
    <>
      <rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.4" />
      <path d="M15.4 8.6V6.2a2 2 0 0 0-2-2H6.2a2 2 0 0 0-2 2v7.2a2 2 0 0 0 2 2h2.4" />
    </>
  ),
  paste: (
    <>
      <rect x="5.8" y="4.8" width="12.4" height="15.6" rx="2.2" />
      <path d="M9.2 4.8a2.8 2.8 0 0 1 5.6 0M9.2 11h5.6M9.2 14.4h3.6" />
    </>
  ),
  share: (
    <>
      <circle cx="17.4" cy="5.8" r="2.4" />
      <circle cx="6.6" cy="12" r="2.4" />
      <circle cx="17.4" cy="18.2" r="2.4" />
      <path d="M8.7 10.8l6.6-3.8M8.7 13.2l6.6 3.8" />
    </>
  ),
  external: <path d="M13.4 4.6h6v6M19.4 4.6 11 13M17.4 14.2v3.9a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V8.5A1.8 1.8 0 0 1 6 6.7h3.9" />,
  moon: <path d="M19.4 14.7A7.8 7.8 0 0 1 9.3 4.6a7.8 7.8 0 1 0 10.1 10.1z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.7" />
      <path d="M12 2.6v2.1M12 19.3v2.1M21.4 12h-2.1M4.7 12H2.6M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5M18.6 18.6l-1.5-1.5M6.9 6.9 5.4 5.4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-[22px] shrink-0", className)}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
