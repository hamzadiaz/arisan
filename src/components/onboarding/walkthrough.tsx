"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { FrameCycle } from "@/components/mobile/frame-cycle";
import { ASSETS, FRAMES } from "@/lib/assets";
import { cn } from "@/lib/utils";

export const WALKTHROUGH_KEY = "arisan.walkthrough.v1";

const SCREENS = [
  { still: ASSETS.walkCircle, frames: FRAMES.circle, title: "Form a circle" },
  { still: ASSETS.walkPay, frames: FRAMES.pay, title: "Everyone pays in" },
  { still: ASSETS.walkPayout, frames: FRAMES.payout, title: "One takes the pot" },
  { still: ASSETS.walkWallet, frames: FRAMES.wallet, title: "Your wallet", line: "You sign." },
];

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
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 bg-background"
        >
          <div className="mx-auto flex h-full w-full max-w-[480px] flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center justify-end">
              <button
                onClick={markSeen}
                className="-mr-3 h-10 rounded-full px-3 text-sm font-medium text-muted-foreground active:text-foreground"
              >
                Skip
              </button>
            </div>

            <motion.div
              className="flex flex-1 touch-pan-y flex-col items-center justify-center"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={onDragEnd}
            >
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
                  <FrameCycle
                    frames={screen.frames}
                    still={screen.still}
                    data-testid="walkthrough-art"
                    className="size-72"
                  />
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight">{screen.title}</h2>
                  {screen.line && <p className="mt-1 text-[15px] text-muted-foreground">{screen.line}</p>}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <div className="mb-6 flex justify-center gap-1.5" aria-hidden>
              {SCREENS.map((s, i) => (
                <motion.span
                  key={s.title}
                  data-testid="walkthrough-dot"
                  animate={{ width: i === index ? 20 : 6 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "h-1.5 rounded-full",
                    i === index ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            <button
              onClick={() => go(index + 1)}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80"
            >
              {last ? "Get started" : "Next"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
