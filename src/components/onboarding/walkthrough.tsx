"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Icon, type IconName } from "@/components/bezel/icons";
import { IntroStage } from "@/components/onboarding/intro-stage";
import { introSeen, markIntroSeen, subscribeIntro } from "@/components/onboarding/intro-store";
import { cn } from "@/lib/utils";

// How Arisan works, one step a slide, played out on the app's own dial
const SLIDES = [
  { eyebrow: "The circle", title: "Pick your people", line: "Friends, family or coworkers. 2 to 20 seats." },
  { eyebrow: "Every round", title: "Pay in each round", line: "Every seat pays the same. It all goes in one pot." },
  { eyebrow: "The draw", title: "Take the pot once", line: "A fair draw each round. Every seat wins once." },
  { eyebrow: "Your wallet", title: "You approve", line: "Connect a Solana wallet. Every payment asks first." },
];

// What holds it together, at a glance
const FACTS: { icon: IconName; title: string; line: string }[] = [
  { icon: "coin", title: "0% interest", line: "Get back what you put in" },
  { icon: "draw", title: "Fair draw", line: "The chain picks, not a person" },
  { icon: "lock", title: "Stake back", line: "When you pay every round" },
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
    if (next >= SLIDES.length) return markIntroSeen();
    setPage([next, next > index ? 1 : -1]);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(index - 1);
  };
  const last = index === SLIDES.length - 1;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") markIntroSeen();
    else if (e.key === "ArrowRight" && !last) go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Tab") {
      // Keep focus inside the intro: it covers the whole app
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)")];
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

  const slide = SLIDES[index];
  const shift = reduceMotion ? 0 : 36;

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
          className="bz-intro fixed inset-0 z-50 overflow-y-auto overscroll-contain text-foreground outline-none"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
            <div className="flex h-[60px] shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/seal-compact.svg" alt="" width={34} height={34} className="size-[34px]" />
              <span className="min-w-0 flex-1 leading-none">
                <span className="bz-wordmark block">Arisan</span>
                <span className="bz-label mt-1.5 block text-[9px]">Savings circles</span>
              </span>
              <button
                onClick={markIntroSeen}
                className="bz-hit h-9 rounded-full px-4 text-[13.5px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--line-2)] transition-transform active:scale-[0.97]"
              >
                Skip
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-3 py-2">
              <motion.section
                className="bz-intro-card touch-pan-y"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.14}
                onDragEnd={onDragEnd}
              >
                <span className="bz-eyebrow">{slide.eyebrow}</span>
                <IntroStage beat={index} />

                <div className="min-h-[106px]" aria-live="polite">
                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div
                      key={index}
                      custom={direction}
                      variants={{
                        enter: (d: number) => ({ opacity: 0, x: d * shift }),
                        center: { opacity: 1, x: 0 },
                        // Exiting slides read the latest direction from AnimatePresence's custom.
                        exit: (d: number) => ({ opacity: 0, x: d * -shift }),
                      }}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <h2 className="bz-intro-title">{slide.title}</h2>
                      <p className="mx-auto mt-2 max-w-[290px] text-[15.5px] leading-snug text-foreground/70 [text-wrap:balance]">{slide.line}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <button onClick={() => go(index - 1)} disabled={index === 0} className="bz-intro-back">
                    Back
                  </button>
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    {SLIDES.map((s, i) => (
                      <span key={s.title} data-testid="walkthrough-dot" className={cn("bz-intro-step", i < index && "is-done", i === index && "is-now")} />
                    ))}
                  </div>
                  <button onClick={() => go(index + 1)} className="bz-intro-next">
                    {last ? "Get started" : "Next"}
                  </button>
                </div>
              </motion.section>

              <ul className="grid grid-cols-3 gap-2.5 [@media(max-height:720px)]:hidden">
                {FACTS.map((f) => (
                  <li key={f.title} className="bz-intro-fact">
                    <Icon name={f.icon} className="size-5 text-gold-hi" />
                    <span className="mt-2 block text-[13px] font-semibold leading-tight">{f.title}</span>
                    <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">{f.line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
