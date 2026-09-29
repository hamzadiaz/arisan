"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { JackpotScene } from "@/components/onboarding/jackpot-scene";
import { cn } from "@/lib/utils";

export const WALKTHROUGH_KEY = "arisan.walkthrough.v1";

const SCREENS = [
  { title: "Together" },
  { title: "Pay in" },
  { title: "Jackpot" },
  { title: "Your wallet", line: "You approve." },
];

// Espresso into emerald. The scene is always dark, whatever the app theme.
const BACKDROP = "linear-gradient(165deg, #1d130b 0%, #150e08 38%, #0a1f17 72%, #033a2b 100%)";

// Remembered in memory too, so it stays closed if storage is unavailable (private mode).
let dismissed = false;
const listeners = new Set<() => void>();

function seen() {
  if (dismissed) return true;
  try {
    return localStorage.getItem(WALKTHROUGH_KEY) !== null;
  } catch {
    return true;
  }
}

function markSeen() {
  dismissed = true;
  try {
    localStorage.setItem(WALKTHROUGH_KEY, "done");
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One-time intro shown over the app on first visit. Skip or finish hides it for good. */
export function Walkthrough() {
  // Server snapshot is "closed": localStorage only exists on the client.
  const open = useSyncExternalStore(subscribe, () => !seen(), () => false);
  const [[index, direction], setPage] = useState([0, 0]);
  const reduceMotion = useReducedMotion();

  const go = (next: number) => {
    if (next < 0) return;
    if (next >= SCREENS.length) return markSeen();
    setPage([next, next > index ? 1 : -1]);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(index - 1);
  };

  const last = index === SCREENS.length - 1;
  const screen = SCREENS[index];
  const shift = reduceMotion ? 0 : 48;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="walkthrough"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Arisan"
          data-testid="walkthrough"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-50 overflow-hidden text-white"
          style={{ background: BACKDROP }}
        >
          <JackpotScene beat={index} className="pointer-events-none absolute inset-0 size-full" />
          {/* Vignette so the glass UI reads over the brightest part of the scene. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,transparent_45%,rgba(8,5,3,0.55)_100%)]"
          />

          <motion.div
            className="relative mx-auto flex h-full w-full max-w-[480px] touch-pan-y flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-16 items-center justify-end">
              <button
                onClick={markSeen}
                className="h-9 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white/80 backdrop-blur-md transition-colors active:bg-white/20"
              >
                Skip
              </button>
            </div>

            <div className="flex-1" />

            <div className="flex h-24 flex-col items-center justify-end">
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
                  className="flex flex-col items-center"
                >
                  <h2 className="bg-gradient-to-b from-[#FBEFC4] to-[#D4AF37] bg-clip-text text-4xl font-semibold tracking-tight text-transparent drop-shadow-[0_2px_24px_rgba(212,175,55,0.35)]">
                    {screen.title}
                  </h2>
                  {screen.line && <p className="mt-1.5 text-[15px] text-white/70">{screen.line}</p>}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="my-6 flex justify-center gap-1.5" aria-hidden>
              {SCREENS.map((s, i) => (
                <motion.span
                  key={s.title}
                  data-testid="walkthrough-dot"
                  animate={{ width: i === index ? 20 : 6 }}
                  transition={{ duration: 0.25 }}
                  className={cn("h-1.5 rounded-full", i === index ? "bg-[#D4AF37]" : "bg-white/25")}
                />
              ))}
            </div>

            <button
              onClick={() => go(index + 1)}
              className={cn(
                "flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold backdrop-blur-xl transition-[opacity,background-color] active:opacity-80",
                last
                  ? "bg-[#D4AF37] text-[#1d130b] shadow-[0_8px_32px_rgba(212,175,55,0.35)]"
                  : "border border-white/15 bg-white/10 text-white"
              )}
            >
              {last ? "Get started" : "Next"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
