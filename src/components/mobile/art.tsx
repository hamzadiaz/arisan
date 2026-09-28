"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Decorative brand art. Keeps its box if the file is missing so layout never jumps. */
export function Art({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("select-none object-contain", failed && "invisible", className)}
    />
  );
}
