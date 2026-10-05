"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dial } from "@/components/bezel/dial";
import type { DialSpec } from "@/components/bezel/dial-spec";
import { Icon } from "@/components/bezel/icons";
import { cn } from "@/lib/utils";

// The intro's table: six people, you nearest. The names are Indonesian, like arisan itself.
const PEOPLE = [
  { name: "Ana", tone: "#3f6e8c" },
  { name: "Budi", tone: "#8a5a3c" },
  { name: "Citra", tone: "#7b4f87" },
  { name: "You", tone: "" },
  { name: "Dewi", tone: "#2f7d68" },
  { name: "Eko", tone: "#7c6a2e" },
];
const ALL = [0, 1, 2, 3, 4, 5];
const YOU = 3;
const WINNER = 2;
const EACH = 0.5;
const POT = EACH * ALL.length;
// You join and pay first, then round the table
const ORDER = [3, 4, 5, 0, 1, 2];
// The draw: a light runs round the table, slowing, and stops on the winner
const HOPS = [4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2];
const HOP_MS = [70, 80, 90, 100, 115, 135, 160, 190, 225, 270, 330];

type Gate = "draw" | "approve";
interface Script {
  /** ms before each step moves on, or a gate that waits for a tap (`auto`: or this long) */
  waits: (number | { gate: Gate; auto?: number })[];
  /** where the scene rests without motion (reduced motion, or the flat dial) */
  rest: number;
}

const SCRIPTS: Script[] = [
  // 0..6 seated
  { waits: Array(6).fill(320), rest: 6 },
  // 0..6 paid
  { waits: Array(6).fill(520), rest: 6 },
  // 0 ready, 1..11 the light runs, 12 won
  { waits: [{ gate: "draw", auto: 2600 }, ...HOP_MS], rest: 0 },
  // 0 round two, 1 the wallet asks, 2 approved, 3 paid
  { waits: [450, { gate: "approve" }, 380], rest: 1 },
];

interface Scene {
  spec: DialSpec;
  seated: number[];
  paid: number[];
  pot: number;
  /** the seat whose coin is on its way to the pot */
  coin?: number;
  pick?: number;
  winner?: number;
  sheet?: boolean;
}

function sceneAt(beat: number, step: number): Scene {
  if (beat === 0) {
    const seated = ORDER.slice(0, step);
    return { spec: { seats: 6, mode: "pending", open: ALL.filter((i) => !seated.includes(i)), you: YOU }, seated, paid: [], pot: 0 };
  }
  if (beat === 1) {
    const paid = ORDER.slice(0, step);
    return { spec: { seats: 6, mode: "active", round: 1, paid, you: YOU }, seated: ALL, paid, pot: paid.length * EACH, coin: step > 0 ? ORDER[step - 1] : undefined };
  }
  if (beat === 2) {
    const won = step === HOPS.length + 1;
    return {
      spec: { seats: 6, mode: "active", round: 1, paid: ALL, won: won ? [WINNER] : [], you: YOU },
      seated: ALL,
      paid: ALL,
      pot: won ? 0 : POT,
      pick: step > 0 && !won ? HOPS[step - 1] : undefined,
      winner: won ? WINNER : undefined,
    };
  }
  // Round two: everyone else has paid, the wallet asks you
  const paid = step >= 3 ? ALL : ALL.filter((i) => i !== YOU);
  return { spec: { seats: 6, mode: "active", round: 2, paid, won: [WINNER], you: YOU }, seated: ALL, paid, pot: paid.length * EACH, sheet: step === 1 };
}

const sol = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} SOL`;

/** The intro's dial with the people around it: each beat plays once the 3D dial draws. */
export function IntroStage({ beat }: { beat: number }) {
  const reduceMotion = !!useReducedMotion();
  const [live, setLive] = useState<boolean | null>(null);
  const [clock, setClock] = useState({ beat, step: 0, acted: false });
  const { waits, rest } = SCRIPTS[beat];
  const last = waits.length;
  // No motion: each beat rests where it explains itself; a tap jumps to its end
  const still = live === false || reduceMotion;
  const own = clock.beat === beat;
  const step = still ? (own && clock.acted ? last : rest) : own ? clock.step : 0;
  const scene = sceneAt(beat, step);
  const wait = waits[step];
  const gate = typeof wait === "object" ? wait : null;

  useEffect(() => {
    if (!live || reduceMotion || step >= last) return;
    const ms = typeof wait === "number" ? wait : wait.auto;
    if (ms === undefined) return;
    const timer = setTimeout(() => setClock({ beat, step: step + 1, acted: false }), ms);
    return () => clearTimeout(timer);
  }, [beat, step, last, wait, live, reduceMotion]);

  const act = (name: Gate) => {
    if (gate?.gate === name) setClock({ beat, step: still ? last : step + 1, acted: true });
  };

  return (
    <div data-testid="walkthrough-scene" data-beat={beat} data-step={step} className="relative flex w-full flex-col items-center">
      {/* Room around the glass for the people: the front seat sits lowest */}
      <div className="w-[min(232px,60vw)] pb-9 pt-5">
        <Dial
          intro
          fixedSeats
          view="create"
          seatRadius={1.62}
          scene={beat}
          spec={scene.spec}
          size={232}
          onLive={setLive}
          overlay={(spots) =>
            spots && (
              <div aria-hidden="true">
                {scene.seated.map((i) => (
                  <span key={i} className="bz-seat-spot" style={{ left: `${spots[i].x * 100}%`, top: `${spots[i].y * 100}%` }}>
                    <motion.span
                      initial={still ? false : { scale: 0.3, opacity: 0 }}
                      animate={{ scale: scene.pick === i ? 1.16 : 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 26 }}
                      className={cn(
                        "bz-person",
                        i === YOU && "is-you",
                        scene.paid.includes(i) && "is-paid",
                        scene.pick === i && "is-pick",
                        scene.winner === i && "is-winner"
                      )}
                      style={{ "--tone": PEOPLE[i].tone } as React.CSSProperties}
                    >
                      {i === YOU ? "You" : PEOPLE[i].name[0]}
                    </motion.span>
                  </span>
                ))}
                {scene.coin !== undefined && !still && (
                  <motion.span
                    key={`coin-${step}`}
                    className="bz-coin-chip"
                    style={{ x: "-50%", y: "-50%" }}
                    initial={{ left: `${spots[scene.coin].x * 100}%`, top: `${spots[scene.coin].y * 100}%`, scale: 1, opacity: 1 }}
                    animate={{ left: "50%", top: "48%", scale: 0.5, opacity: [1, 1, 0] }}
                    transition={{ duration: 0.55, ease: "easeIn" }}
                  />
                )}
                {scene.winner !== undefined && (
                  <span className="bz-seat-spot" style={{ left: `${spots[scene.winner].x * 100}%`, top: `${spots[scene.winner].y * 100}%` }}>
                    <motion.span className="bz-win-tag" style={{ x: "-50%" }} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      {PEOPLE[scene.winner].name} · +{sol(POT)}
                    </motion.span>
                  </span>
                )}
              </div>
            )
          }
        />
      </div>

      {/* What the dial is showing, in words and numbers */}
      <div className="flex h-11 items-center justify-center gap-2.5">
        {beat === 0 ? (
          <span className="bz-intro-status">
            <b>{scene.seated.length === ALL.length ? "6 seats" : `${scene.seated.length} of 6 seats`}</b>
            {scene.seated.length === ALL.length && " · 6 rounds"}
          </span>
        ) : beat === 2 && scene.pick === undefined && scene.winner === undefined ? (
          <>
            <span className="bz-intro-status">
              Pot <b>{sol(scene.pot)}</b>
            </span>
            <button onClick={() => act("draw")} className="bz-intro-try">
              <Icon name="draw" className="size-4" />
              Draw
            </button>
          </>
        ) : beat === 2 ? (
          <span className="bz-intro-status" role="status">
            {scene.winner === undefined ? (
              "Drawing…"
            ) : (
              <>
                <b>{PEOPLE[WINNER].name}</b> takes <b>{sol(POT)}</b>
              </>
            )}
          </span>
        ) : beat === 3 && step >= 3 ? (
          <span className="bz-intro-status" role="status">
            <Icon name="check" className="size-4 text-glow" />
            You paid round 2
          </span>
        ) : (
          <span className="bz-intro-status">
            {beat === 3 && "Round 2 · "}Pot <b>{sol(scene.pot)}</b>
            {beat === 1 && <span className="text-muted-foreground"> · {sol(EACH)} each</span>}
          </span>
        )}
      </div>

      <AnimatePresence>
        {scene.sheet && (
          <motion.div
            key="sheet"
            initial={still ? false : { y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={still ? { opacity: 0 } : { y: "110%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="bz-intro-sheet"
          >
            <div className="flex items-center gap-2">
              <Icon name="wallet" className="size-[18px] text-gold-hi" />
              <span className="text-[14px] font-semibold">Approve payment</span>
              <span className="bz-intro-demo">Demo</span>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-3">
              <div className="text-left">
                <p className="text-[12.5px] text-muted-foreground">Family circle · round 2</p>
                <p className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-[-0.02em]">{sol(EACH)}</p>
              </div>
              <button onClick={() => act("approve")} className="bz-intro-try">
                Approve
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
