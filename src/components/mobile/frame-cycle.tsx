"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useReducedMotion } from "framer-motion";
import { Art } from "@/components/mobile/art";

/**
 * Why the art is or is not moving. Exposed as data-frame-state so a frozen loop is never silent.
 * - loading: frames still fetching, the still shows
 * - playing: every frame loaded, decoded and differs from the others
 * - duplicate: two or more frames are the same file, so looping would look frozen (an art bug)
 * - decode-failed: a frame is missing or would not decode
 * - reduced-motion: the viewer asked for no motion
 */
export type FrameState = "loading" | "playing" | "duplicate" | "decode-failed" | "reduced-motion";

type Loaded = { frames: readonly string[]; state: "playing" | "duplicate" | "decode-failed" };

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

async function loadFrame(src: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const img = new Image();
  img.src = src;
  await img.decode();
  return { src, bytes, img };
}

/**
 * Six-frame scene animation. Shows the still until every frame has loaded and decoded,
 * then loops the frames. Frames that repeat a file, or fail to load, keep the still and
 * log why (docs/ANIMATION_SPEC.md). Reduced motion keeps the still.
 */
export function FrameCycle({
  frames,
  still,
  fps = 8,
  ...rest
}: { frames: readonly string[]; still: string; fps?: number } & Omit<ComponentProps<"img">, "src">) {
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [frame, setFrame] = useState(0);
  // Hold the decoded images so the browser keeps them ready for each swap.
  const decoded = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    Promise.allSettled(frames.map(loadFrame)).then((results) => {
      if (cancelled) return;
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        for (const r of failed) console.error("[FrameCycle] frame failed to load", r.reason);
        setLoaded({ frames, state: "decode-failed" });
        return;
      }
      const ok = results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof loadFrame>>>).value);
      const dupes = ok.flatMap((a, i) =>
        ok
          .slice(i + 1)
          .filter((b) => sameBytes(a.bytes, b.bytes))
          .map((b) => `${a.src} = ${b.src}`)
      );
      if (dupes.length) {
        console.error("[FrameCycle] frames are identical files, the loop would look frozen:", dupes);
        setLoaded({ frames, state: "duplicate" });
        return;
      }
      decoded.current = ok.map((f) => f.img);
      setLoaded({ frames, state: "playing" });
    });
    return () => {
      cancelled = true;
    };
  }, [frames, reduceMotion]);

  const state: FrameState = reduceMotion ? "reduced-motion" : loaded?.frames === frames ? loaded.state : "loading";
  const playing = state === "playing";

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length]);

  return (
    <Art {...rest} src={playing ? frames[frame] : still} data-playing={playing} data-frame-state={state} />
  );
}
