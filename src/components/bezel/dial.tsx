"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { DialSpec } from "./dial-spec";
import type { DialScene, DialView } from "./dial-scene";
import { MiniDial } from "./mini-dial";

let webgl: boolean | null = null;
function hasWebGL2() {
  if (webgl !== null) return webgl;
  try {
    webgl = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl = false;
  }
  return webgl;
}

interface DialProps {
  spec: DialSpec;
  /** CSS width in px; the dial stays square and never wider than its container. */
  size?: number;
  view?: DialView;
  /** Show seat numbers around the glass (circle screen). */
  numerals?: boolean;
  label?: string;
  className?: string;
}

/**
 * The Bezel dial. The SVG dial paints first and stays as the fallback; Three.js loads only
 * when the dial is on screen, runs only while visible, and animates spec changes
 * (a new payment, a new winner, a different seat count).
 */
export function Dial({ spec, size = 300, view = "hero", numerals = false, label, className }: DialProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<DialScene | null>(null);
  const latest = useRef(spec);
  const [ready, setReady] = useState(false);
  const [labels, setLabels] = useState<{ x: number; y: number }[] | null>(null);
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  const key = JSON.stringify(spec);

  useEffect(() => {
    latest.current = spec;
  });

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv || resolvedTheme === undefined || !hasWebGL2()) return;
    let alive = true;
    let s: DialScene | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mount = async () => {
      const { DialScene } = await import("./dial-scene");
      if (!alive) return;
      try {
        const background = light ? getComputedStyle(document.body).backgroundColor : undefined;
        s = new DialScene(cv, latest.current, { light, view, background, reducedMotion });
      } catch {
        return; // no WebGL after all: the SVG stays
      }
      scene.current = s;
      const r = el.getBoundingClientRect();
      s.resize(r.width, r.height);
      setLabels(s.seatLabels());
      setReady(true);
      s.start();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          s?.stop();
          return;
        }
        if (s) s.start();
        else void mount();
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    const ro = new ResizeObserver(([entry]) => {
      if (!s) return;
      s.resize(entry.contentRect.width, entry.contentRect.height);
      setLabels(s.seatLabels());
    });
    ro.observe(el);
    const onVisibility = () => {
      if (document.hidden) s?.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      s?.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [light, view, resolvedTheme]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    void s.update(JSON.parse(key) as DialSpec).then(() => {
      if (scene.current === s) setLabels(s.seatLabels());
    });
  }, [key]);

  return (
    <div
      ref={wrap}
      role="img"
      aria-label={label}
      className={cn("dial-glow relative mx-auto aspect-square max-w-full shrink-0", className)}
      style={{ width: size }}
    >
      <div className={cn("absolute inset-[7%] transition-opacity duration-500", ready && "opacity-0")} aria-hidden="true">
        <MiniDial spec={spec} light={light} className="size-full" />
      </div>
      <canvas
        ref={canvas}
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500", ready && "opacity-100")}
      />
      {numerals && ready && labels && (
        <div aria-hidden="true">
          {labels.map((p, i) => (
            <span
              key={i}
              className={cn("dial-numeral", i === spec.you && "dial-numeral-you")}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
