"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { introSeen, subscribeIntro } from "@/components/onboarding/intro-store";
import type { DialSpec } from "./dial-spec";
import type { AttachOptions, DialEngine, DialOwner, DialView } from "./dial-scene";
import { MiniDial } from "./mini-dial";

type SceneModule = typeof import("./dial-scene");

// The <head> probe (gl-probe.ts) decided before first paint whether this device draws 3D.
let support: boolean | null = null;
function supports3D() {
  support ??= document.documentElement.dataset.gl === "3d";
  return support;
}

// A device that keeps losing its GL context gets the SVG for the rest of the session
let lostContexts = 0;
const MAX_LOST_CONTEXTS = 3;
/** Count a lost context; false once the device has lost too many to keep trying 3D. */
function retryAfterLoss() {
  lostContexts += 1;
  if (lostContexts >= MAX_LOST_CONTEXTS) {
    support = false;
    // Dials still waiting for 3D show their SVG
    document.documentElement.dataset.gl = "flat";
  }
  return support !== false;
}

// three loads only when a dial is mounted
let sceneModule: SceneModule | null = null;
const loadScene = () => import("./dial-scene").then((m) => (sceneModule = m));

/** The engine, or null if this device can't make one after all (no WebGL 2). */
function engineFrom(m: SceneModule) {
  try {
    return m.getDialEngine();
  } catch {
    return null;
  }
}

// What's on screen, not next-themes state (undefined before mount)
const pageTheme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
const watchTheme = (changed: () => void) => {
  const mo = new MutationObserver(changed);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
};
const REDUCED = "(prefers-reduced-motion: reduce)";
const reducedMotion = () => window.matchMedia(REDUCED).matches;
const watchMotion = (changed: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", changed);
  return () => mq.removeEventListener("change", changed);
};
const watchNothing = () => () => {};

/** The opaque colour behind the dial (a card or the page): light mode draws it so the glass refracts it. */
function surfaceBehind(el: HTMLElement) {
  // Any CSS colour (rgb, oklab, color-mix…) read back as sRGB through one pixel
  const px = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  for (let n = el.parentElement; n && px; n = n.parentElement) {
    const css = getComputedStyle(n).backgroundColor;
    if (css === "transparent" || css === "rgba(0, 0, 0, 0)") continue;
    px.clearRect(0, 0, 1, 1);
    px.fillStyle = css;
    px.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = px.getImageData(0, 0, 1, 1).data;
    if (a > 128) return `rgb(${r}, ${g}, ${b})`;
  }
  return getComputedStyle(document.body).backgroundColor;
}

type SeatSpot = { x: number; y: number };
/** Seat labels sit at 1.48 on the table; the flat SVG puts that radius at 0.465 of its width. */
const LABEL_RADIUS = 1.48;
// If the 3D dial isn't up by then (slow network or GPU), the SVG stands in until it is
const SLOW_MS = 2500;

interface DialProps {
  spec: DialSpec;
  /** CSS width in px; the dial stays square and never wider than its container. */
  size?: number;
  view?: DialView;
  /** Seat numbers around the glass (circle screen). */
  numerals?: boolean;
  /** Keep the bezel turning while a draw is in flight. */
  drawing?: boolean;
  label?: string;
  className?: string;
  /** The intro's own dial: it holds the engine while the intro is open. */
  intro?: boolean;
  /** Seats stay put (a new winner flips the coin without the spin), so `overlay` can sit beside them. */
  fixedSeats?: boolean;
  /** Where `overlay` places things around the glass, in table units (the glass ends at 1.34). */
  seatRadius?: number;
  /** Drawn over the dial with each seat's spot (0–1 of the dial's box), or null until it draws. */
  overlay?: (seats: SeatSpot[] | null) => ReactNode;
  /** A new scene cuts straight to `spec` instead of animating there (the intro's beats, a first read). */
  scene?: string | number;
  /** Told when the 3D dial draws (true) or the SVG stands in (false). */
  onLive?: (live: boolean) => void;
}

/**
 * The Bezel dial. On a real GPU the shared Three.js engine draws it and animates spec changes:
 * a new payment (C1), a new winner (C2), a new seat count (C3), a seat taken. Its flat SVG is
 * the fallback, and never shows first where 3D is coming: the two don't look alike.
 * "auto" waits for the engine, "still" holds the last 3D frame after another dial took it.
 */
export function Dial({
  spec,
  size = 280,
  view = "hero",
  numerals = false,
  drawing = false,
  label,
  className,
  intro = false,
  fixedSeats = false,
  seatRadius = LABEL_RADIUS,
  overlay,
  scene,
  onLive,
}: DialProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<DialEngine | null>(null);
  const latest = useRef(spec);
  const told = useRef(onLive);
  const radius = useRef(seatRadius);
  const shownScene = useRef(scene);
  const [state, setMode] = useState<"auto" | "webgl" | "svg" | "still">("auto");
  // null on the server and while hydrating
  const gl = useSyncExternalStore(watchNothing, supports3D, () => null);
  const mode = gl === false ? "svg" : state;
  // Attached to an engine that was already warm: the canvas shows at once, without a fade
  const [instant, setInstant] = useState(false);
  const [labels, setLabels] = useState<SeatSpot[] | null>(null);
  const theme = useSyncExternalStore(watchTheme, pageTheme, () => null);
  const calm = useSyncExternalStore(watchMotion, reducedMotion, () => false);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(spec);

  useLayoutEffect(() => {
    latest.current = spec;
    told.current = onLive;
    radius.current = seatRadius;
  });

  // Before paint: a warm engine draws this dial in its first frame.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !supports3D()) return;
    let alive = true;
    let visible = false;
    // Once another dial takes the engine, this one doesn't take it back
    let evicted = false;
    let cold: Promise<void> | null = null;
    let slow: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let frame: HTMLCanvasElement | null = null;
    const options = (): AttachOptions => ({
      theme: pageTheme(),
      view,
      background: surfaceBehind(el),
      reducedMotion: reducedMotion(),
      fixedSeats,
    });
    // A page's dial waits while the intro's dial holds the engine
    const held = () => !intro && !introSeen();
    const dropFrame = () => {
      frame?.remove();
      frame = null;
    };

    // A lost context: try a fresh engine once the page is visible again, blank meanwhile (the
    // SVG shows only if that's slow). A device that keeps losing it gets the SVG for good.
    const lost = () => {
      if (!alive) return;
      engine.current = null;
      if (!retryAfterLoss()) {
        setMode("svg");
        return;
      }
      setMode("auto");
      retry = setTimeout(() => {
        if (!alive) return;
        if (document.hidden) document.addEventListener("visibilitychange", () => alive && setAttempt((n) => n + 1), { once: true });
        else setAttempt((n) => n + 1);
      }, 1500);
    };
    const owner: DialOwner = {
      onLost: lost,
      // Another dial took the engine: keep its last frame while this one leaves, never the SVG
      onEvict: (still) => {
        if (!alive) return;
        evicted = true;
        engine.current = null;
        dropFrame();
        if (still) el.appendChild((frame = still));
        setMode(still ? "still" : "auto");
      },
    };
    const take = (e: DialEngine) => {
      dropFrame();
      engine.current = e;
      e.attach(el, latest.current, options(), owner);
    };

    const holds = (e: DialEngine) => engine.current === e;
    const warmStart = (e: DialEngine) => {
      take(e);
      void e.warm();
      setLabels(e.seatLabels(seatRadius));
      setInstant(true);
      setMode("webgl");
    };
    const coldStart = async () => {
      slow = setTimeout(() => alive && setMode((m) => (m === "auto" ? "svg" : m)), SLOW_MS);
      const m = await loadScene().catch(() => null);
      if (!alive || engine.current) return;
      const e = m && engineFrom(m);
      if (!e) {
        // The 3D chunk didn't load (offline) or there's no WebGL 2 after all: the SVG stays
        setMode("svg");
        return;
      }
      take(e);
      await e.warm().catch(() => undefined);
      // Another dial may have taken it while the shaders compiled
      if (!alive || e.isLost || !holds(e)) return;
      if (slow) clearTimeout(slow);
      setLabels(e.seatLabels(seatRadius));
      setInstant(false);
      setMode("webgl");
    };
    const start = () => {
      if (!alive || evicted || engine.current || !visible || held()) return;
      const warm = sceneModule?.readyDialEngine();
      if (warm) warmStart(warm);
      else if (!cold) cold = coldStart();
    };

    void loadScene().catch(() => null);
    const r = el.getBoundingClientRect();
    visible = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        start();
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    const unhold = intro ? null : subscribeIntro(start);
    const ro = new ResizeObserver(([entry]) => {
      const e = engine.current;
      if (!e) return;
      e.resize(entry.contentRect.width, entry.contentRect.height);
      setLabels(e.seatLabels(seatRadius));
    });
    ro.observe(el);
    start();

    return () => {
      alive = false;
      if (slow) clearTimeout(slow);
      if (retry) clearTimeout(retry);
      io.disconnect();
      ro.disconnect();
      unhold?.();
      engine.current?.detach(el);
      engine.current = null;
      dropFrame();
      setMode("auto");
    };
  }, [view, attempt, intro, fixedSeats, seatRadius]);

  // A theme toggle restyles the attached dial in place: no hand-back, no SVG flash.
  useEffect(() => {
    const e = engine.current;
    const el = host.current;
    if (!e || !el || mode !== "webgl" || !theme) return;
    e.setTheme(theme, surfaceBehind(el));
  }, [theme, mode]);

  useEffect(() => {
    const e = engine.current;
    if (!e || mode !== "webgl") return;
    const next = JSON.parse(key) as DialSpec;
    if (scene !== shownScene.current) {
      shownScene.current = scene;
      e.show(next);
      setLabels(e.seatLabels(radius.current));
      return;
    }
    void e.update(next).then(() => {
      if (engine.current === e) setLabels(e.seatLabels(radius.current));
    });
  }, [key, mode, scene]);

  useEffect(() => {
    const e = engine.current;
    if (!e || mode !== "webgl") return;
    void e.setDrawing(drawing).then(() => {
      if (engine.current === e) setLabels(e.seatLabels(radius.current));
    });
  }, [drawing, mode]);

  useEffect(() => {
    if (mode === "webgl" || mode === "svg") told.current?.(mode === "webgl");
  }, [mode]);

  const flat = mode === "svg" ? flatLabels(spec.seats, seatRadius / LABEL_RADIUS) : null;
  // Labels can't follow a free spin; hide them until the bezel settles (it doesn't spin at all
  // with reduced motion).
  const shown = mode === "webgl" ? (drawing && !calm ? null : labels) : flat;

  return (
    <div
      ref={host}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-dial={mode}
      data-instant={instant ? "" : undefined}
      className={cn("dial-glow relative mx-auto aspect-square max-w-full shrink-0", className)}
      style={{ width: size }}
    >
      <div className="dial-poster absolute inset-[7%]" aria-hidden="true">
        <MiniDial spec={spec} className="size-full" />
      </div>
      {overlay && <div className="absolute inset-0">{overlay(shown)}</div>}
      {numerals && shown && (
        <div aria-hidden="true">
          {shown.map((p, i) => (
            <span key={i} className={cn("dial-numeral", i === spec.you && "dial-numeral-you")} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
              {String(i + 1).padStart(2, "0")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Seat labels around the flat SVG dial: just outside the glass ring, or further out by `k`.
function flatLabels(n: number, k = 1) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 0.5 + 0.465 * k * Math.cos(a), y: 0.5 + 0.465 * k * Math.sin(a) };
  });
}
