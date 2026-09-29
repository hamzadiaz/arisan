"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Decorative brand art. Keeps its box if the file is missing so layout never jumps. */
export function Art({ src, className, ...rest }: { src: string } & ComponentProps<"img">) {
  // Tracked per src, so a later frame can show after an earlier file failed.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={cn("select-none object-contain", failedSrc === src && "invisible", className)}
    />
  );
}
