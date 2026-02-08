"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AnimatedBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  borderWidth?: number;
  duration?: number;
  children: React.ReactNode;
}

const AnimatedBorder = React.forwardRef<HTMLDivElement, AnimatedBorderProps>(
  ({ className, borderWidth = 2, duration = 3, children, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-2xl p-[2px] overflow-hidden",
          className
        )}
        style={{
          ...style,
          padding: `${borderWidth}px`,
        }}
        {...props}
      >
        {/* Animated gradient border */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: `conic-gradient(from var(--border-angle, 0deg), transparent 30%, hsl(var(--primary)) 50%, transparent 70%)`,
            animation: `border-spin ${duration}s linear infinite`,
          }}
        />

        {/* Inner background to create border effect */}
        <div className="absolute inset-[2px] rounded-[14px] bg-background" />

        {/* Content */}
        <div className="relative z-10 rounded-[14px] bg-background">
          {children}
        </div>
      </div>
    );
  }
);

AnimatedBorder.displayName = "AnimatedBorder";

export { AnimatedBorder };
