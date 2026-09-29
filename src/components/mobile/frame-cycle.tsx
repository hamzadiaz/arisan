"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useReducedMotion } from "framer-motion";
import { Art } from "@/components/mobile/art";

/**
 * Hand-drawn frame animation. Shows the still until every frame has loaded and decoded,
 * then loops the frames. Reduced motion, or any frame missing, keeps the still.
 */
export function FrameCycle({
  frames,
  still,
  fps = 8,
  ...rest
}: { frames: readonly string[]; still: string; fps?: number } & Omit<ComponentProps<"img">, "src">) {
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState(0);
  // Hold the decoded images so the browser keeps them ready for each swap.
  const decoded = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const images = frames.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    Promise.all(images.map((img) => img.decode())).then(
      () => {
        if (cancelled) return;
        decoded.current = images;
        setReady(true);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [frames, reduceMotion]);

  const playing = ready && !reduceMotion;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length]);

  return <Art {...rest} src={playing ? frames[frame] : still} data-playing={playing} />;
}
