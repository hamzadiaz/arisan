"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DialSpec } from "./dial-spec";
import type { DialEngine, DialView } from "./dial-scene";
import { MiniDial } from "./mini-dial";

// 3D only on a real GPU: software WebGL (CI's SwiftShader, emulators, blocklisted phones) and
// Save-Data get the SVG dial. `?dial=3d` forces the 3D path for a smoke test, `?dial=svg` the SVG.
let support: boolean | null = null;
function supports3D() {
  if (support !== null) return support;
  try {
    const force = new URLSearchParams(window.location.search).get("dial");
    if (force === "svg") return (support = false);
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (force !== "3d" && nav.connection?.saveData) return (support = false);
    const gl = document.createElement("canvas").getContext("webgl2", force === "3d" ? undefined : { failIfMajorPerformanceCaveat: true });
    support = !!gl;
    // Headless Chromium and emulators can pass the caveat check on a CPU rasteriser; name it out.
    if (gl && force !== "3d") {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      if (/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(renderer)) support = false;
    }
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    support = false;
  }
  return support;
}

const walkthroughOpen = () => !!document.querySelector('[data-testid="walkthrough"]');
// three loads only when a dial is on screen
const loadScene = () => import("./dial-scene");

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
}

/**
 * The Bezel dial. The SVG dial paints first and stays as the fallback. On a real GPU the
 * shared Three.js engine attaches while the dial is on screen and animates spec changes:
 * a new payment (C1), a new winner (C2), a new seat count (C3).
 */
export function Dial({ spec, size = 280, view = "hero", numerals = false, drawing = false, label, className }: DialProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<DialEngine | null>(null);
  const latest = useRef(spec);
  const themeNow = useRef<"dark" | "light">("dark");
  const [mode, setMode] = useState<"svg" | "webgl">("svg");
  const [labels, setLabels] = useState<{ x: number; y: number }[] | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(spec);
  const hasTheme = theme !== null;

  useEffect(() => {
    latest.current = spec;
    if (theme) themeNow.current = theme;
  });

  // Follow what's on screen, not next-themes state (undefined before mount).
  useEffect(() => {
    const read = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || !hasTheme || !supports3D()) return;
    let alive = true;
    let waiting: MutationObserver | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Back to the SVG; after a lost context, try a fresh engine once the page is visible again.
    const fallBack = (again: boolean) => {
      if (!alive) return;
      engine.current = null;
      setMode("svg");
      if (again) {
        retry = setTimeout(() => {
          if (!alive) return;
          if (document.hidden) document.addEventListener("visibilitychange", () => alive && setAttempt((n) => n + 1), { once: true });
          else setAttempt((n) => n + 1);
        }, 1500);
      }
    };

    const attach = async () => {
      if (engine.current) return;
      // The 3D chunk may not load (offline): the SVG stays
      const scene = await loadScene().catch(() => null);
      if (!scene || !alive) return;
      let e: DialEngine;
      try {
        e = scene.getDialEngine();
      } catch {
        return; // no WebGL after all: the SVG stays
      }
      engine.current = e;
      e.attach(
        el,
        latest.current,
        { theme: themeNow.current, view, background: getComputedStyle(document.body).backgroundColor, reducedMotion },
        { onLost: () => fallBack(true), onEvict: () => fallBack(false) }
      );
      await e.warm();
      if (!alive || engine.current !== e || e.isLost) return;
      setLabels(e.seatLabels());
      setMode("webgl");
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || engine.current) return;
        if (!walkthroughOpen()) {
          void attach();
          return;
        }
        // Don't animate under the intro; attach when it closes.
        if (!waiting) waiting = new MutationObserver(() => {
          if (walkthroughOpen()) return;
          waiting?.disconnect();
          waiting = null;
          void attach();
        });
        waiting.observe(document.body, { childList: true, subtree: true });
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    const ro = new ResizeObserver(([entry]) => {
      const e = engine.current;
      if (!e) return;
      e.resize(entry.contentRect.width, entry.contentRect.height);
      setLabels(e.seatLabels());
    });
    ro.observe(el);

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      io.disconnect();
      ro.disconnect();
      waiting?.disconnect();
      engine.current?.detach(el);
      engine.current = null;
      setMode("svg");
    };
  }, [hasTheme, view, attempt]);

  // A theme toggle restyles the attached dial in place: no hand-back, no SVG flash.
  useEffect(() => {
    const e = engine.current;
    if (!e || mode !== "webgl" || !theme) return;
    e.setTheme(theme, getComputedStyle(document.body).backgroundColor);
  }, [theme, mode]);

  useEffect(() => {
    const e = engine.current;
    if (!e || mode !== "webgl") return;
    void e.update(JSON.parse(key) as DialSpec).then(() => {
      if (engine.current === e) setLabels(e.seatLabels());
    });
  }, [key, mode]);

  useEffect(() => {
    const e = engine.current;
    if (!e || mode !== "webgl") return;
    void e.setDrawing(drawing).then(() => {
      if (engine.current === e) setLabels(e.seatLabels());
    });
  }, [drawing, mode]);

  const flat = numerals && mode === "svg" ? flatLabels(spec.seats) : null;
  // The numbers can't follow a free spin; hide them until the bezel settles.
  const shown = mode === "webgl" ? (drawing ? null : labels) : flat;

  return (
    <div
      ref={host}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-dial={mode}
      className={cn("dial-glow relative mx-auto aspect-square max-w-full shrink-0", className)}
      style={{ width: size }}
    >
      <div className={cn("absolute inset-[7%] transition-opacity duration-500", mode === "webgl" && "opacity-0")} aria-hidden="true">
        <MiniDial spec={spec} className="size-full" />
      </div>
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

// Seat numbers around the flat SVG dial: just outside the glass ring.
function flatLabels(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 0.5 + 0.465 * Math.cos(a), y: 0.5 + 0.465 * Math.sin(a) };
  });
}
