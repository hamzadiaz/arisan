"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "aurora" | "shine" | "gold";
  animate?: boolean;
  as?: "span" | "h1" | "h2" | "h3" | "h4" | "p";
  children: React.ReactNode;
}

const GradientText = React.forwardRef<HTMLSpanElement, GradientTextProps>(
  ({ className, variant = "default", animate = false, as: Component = "span", children, ...props }, ref) => {
    return (
      <Component
        ref={ref as any}
        className={cn(
          "bg-clip-text text-transparent",
          // Variants
          variant === "default" && [
            "bg-gradient-to-r from-primary via-emerald-400 to-primary",
            animate && "bg-[length:200%_auto] animate-gradient-flow",
          ],
          variant === "aurora" && [
            "bg-gradient-to-r from-emerald-400 via-primary to-teal-400",
            animate && "bg-[length:300%_auto] animate-aurora-shift",
          ],
          variant === "shine" && [
            "bg-gradient-to-r from-primary via-white to-primary bg-[length:200%_auto]",
            "animate-shimmer",
          ],
          variant === "gold" && [
            "bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400",
            animate && "bg-[length:200%_auto] animate-gradient-flow",
          ],
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GradientText.displayName = "GradientText";

export { GradientText };
