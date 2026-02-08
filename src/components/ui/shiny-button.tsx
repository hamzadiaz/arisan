"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  children: React.ReactNode;
}

const ShinyButton = React.forwardRef<HTMLButtonElement, ShinyButtonProps>(
  ({ className, variant = "default", size = "default", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative inline-flex items-center justify-center overflow-hidden rounded-xl font-medium transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          // Size variants
          size === "default" && "h-11 px-6 py-2 text-sm",
          size === "sm" && "h-9 px-4 text-xs",
          size === "lg" && "h-14 px-8 text-base",
          size === "icon" && "h-11 w-11",
          // Variant styles
          variant === "default" && [
            "bg-gradient-to-r from-primary via-emerald-500 to-primary bg-[length:200%_100%]",
            "text-primary-foreground shadow-lg shadow-primary/25",
            "hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-primary/30",
            "hover:scale-[1.02] active:scale-[0.98]",
          ],
          variant === "outline" && [
            "border-2 border-primary/50 bg-transparent text-primary",
            "hover:bg-primary/10 hover:border-primary",
            "hover:shadow-lg hover:shadow-primary/20",
          ],
          variant === "ghost" && [
            "bg-transparent text-foreground",
            "hover:bg-primary/10 hover:text-primary",
          ],
          className
        )}
        {...props}
      >
        {/* Animated shine effect */}
        <span
          className={cn(
            "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent",
            "group-hover:translate-x-full transition-transform duration-700 ease-out"
          )}
        />

        {/* Glow effect on hover */}
        <span
          className={cn(
            "absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300",
            "bg-primary/20 blur-xl group-hover:opacity-100"
          )}
        />

        {/* Content */}
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </button>
    );
  }
);

ShinyButton.displayName = "ShinyButton";

export { ShinyButton };
