"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Dial } from "@/components/bezel/dial";
import type { DialSpec } from "@/components/bezel/dial-spec";
import { introSeen, markIntroSeen, subscribeIntro } from "@/components/onboarding/intro-store";
import { cn } from "@/lib/utils";

// The story runs on the app's own dial: six seats, yours at the top.
const ALL = [0, 1, 2, 3, 4, 5];
const WINNER = 3;
const circle = (state: Partial<DialSpec>): DialSpec => ({ seats: 6, mode: "active", you: 0, ...state });

interface Beat {
  title: string;
  line: string;
  /** The dial's states: the first shows at once, the rest play one after another. */
  steps: DialSpec[];
  /** ms between steps */
  every: number;
}

const BEATS: Beat[] = [
  {
    title: "Together",
    line: "People you trust, one seat each.",
    every: 300,
    // The seats fill, yours first
    steps: [0, 1, 2, 3, 4, 5, 6].map((n) => circle({ mode: "pending", open: ALL.slice(n) })),
  },
  {
    title: "Pay in",
    line: "Each round, everyone pays the same amount.",
    every: 480,
    steps: [0, 1, 2, 3, 4, 5, 6].map((n) => circle({ round: 1, paid: ALL.slice(0, n) })),
  },
  {
    title: "Jackpot",
    line: "One seat takes the whole\u00a0pot. Every seat gets a turn.",
    every: 650,
    // The draw: the bezel spins and stops the winner under the pip
    steps: [circle({ round: 1, paid: ALL }), circle({ round: 1, paid: ALL, won: [WINNER] })],
  },
  {
    title: "Your wallet",
    line: "Nothing moves until you approve.",
    every: 1100,
    // Round two: everyone else has paid; your seat lights once you approve
    steps: [circle({ round: 2, paid: [1, 2, 4, 5], won: [WINNER] }), circle({ round: 2, paid: [0, 1, 2, 4, 5], won: [WINNER] })],
  },
];

/** One-time intro shown over the app on first visit. Skip or finish hides it for good. */
export function Walkthrough() {
  // Server snapshot is "closed": localStorage only exists on the client.
  const open = useSyncExternalStore(subscribeIntro, () => !introSeen(), () => false);
  const [[index, direction], setPage] = useState([0, 0]);
  const reduceMotion = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);

  // Focus moves into the intro, so keyboard and screen reader users start there
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  const go = (next: number) => {
    if (next < 0) return;
    if (next >= BEATS.length) return markIntroSeen();
    setPage([next, next > index ? 1 : -1]);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(index - 1);
  };
  const last = index === BEATS.length - 1;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") markIntroSeen();
    else if (e.key === "ArrowRight" && !last) go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Tab") {
      // Keep focus inside the intro: it covers the whole app
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button")];
      const active = document.activeElement;
      if (e.shiftKey && (active === items[0] || active === e.currentTarget)) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!e.shiftKey && active === items[items.length - 1]) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  };

  const beat = BEATS[index];
  const shift = reduceMotion ? 0 : 40;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="walkthrough"
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Arisan"
          data-testid="walkthrough"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onKeyDown={onKeyDown}
          // Always the dark dial room, whatever the app theme
          className="dark bz-intro fixed inset-0 z-50 overflow-hidden text-foreground outline-none"
        >
          <motion.div
            className="relative mx-auto flex h-full w-full max-w-[480px] touch-pan-y flex-col px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-16 shrink-0 items-center justify-between">
              <span className="flex items-center gap-2.5" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/seal-compact.svg" alt="" width={28} height={28} className="size-7" />
                <span className="bz-wordmark text-[12px]">Arisan</span>
              </span>
              <button
                onClick={markIntroSeen}
                className="bz-hit h-9 rounded-full px-4 text-[13.5px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--line-2)] transition-transform active:scale-[0.97]"
              >
                Skip
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Stage beat={index} />
            </div>

            <div className="h-[118px] shrink-0 text-center" aria-live="polite">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={index}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * shift }),
                    center: { opacity: 1, x: 0 },
                    // Exiting screens read the latest direction from AnimatePresence's custom.
                    exit: (d: number) => ({ opacity: 0, x: d * -shift }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2 className="bz-intro-title">{beat.title}</h2>
                  <p className="mx-auto mt-2.5 max-w-[300px] text-[15.5px] leading-snug text-foreground/70 [text-wrap:balance]">{beat.line}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress reads like the dial's round track: gold done, lume now */}
            <div className="mb-5 flex shrink-0 justify-center gap-1.5" aria-hidden="true">
              {BEATS.map((b, i) => (
                <span key={b.title} data-testid="walkthrough-dot" className={cn("bz-intro-step", i < index && "is-done", i === index && "is-now")} />
              ))}
            </div>

            <button onClick={() => go(index + 1)} className="bz-button bz-button-gold shrink-0">
              {last ? "Get started" : "Next"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The beat on the dial: its first state at once, the rest once the 3D dial is drawing. */
function Stage({ beat }: { beat: number }) {
  const reduceMotion = useReducedMotion();
  const [live, setLive] = useState<boolean | null>(null);
  const [clock, setClock] = useState({ beat, step: 0 });
  const { steps, every } = BEATS[beat];
  const last = steps.length - 1;

  useEffect(() => {
    if (!live || reduceMotion) return;
    let step = 0;
    const timer = setInterval(() => {
      step = Math.min(step + 1, last);
      setClock({ beat, step });
      if (step === last) clearInterval(timer);
    }, every);
    return () => clearInterval(timer);
  }, [beat, live, reduceMotion, every, last]);

  // The flat dial, or no motion: each beat shows where it ends
  const step = live === false || reduceMotion ? last : clock.beat === beat ? clock.step : 0;

  return (
    <div data-testid="walkthrough-scene" data-beat={beat} data-step={step} className="w-[min(380px,94vw,48dvh)]">
      <Dial intro scene={beat} spec={steps[step]} size={380} onLive={setLive} />
    </div>
  );
}
