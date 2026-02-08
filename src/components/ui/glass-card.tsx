"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "premium" | "beam";
  hover?: boolean;
  glow?: boolean;
  children: React.ReactNode;
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", hover = true, glow = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative rounded-2xl transition-all duration-500",
          // Base glass effect
          variant === "default" && [
            "bg-white/[0.03] backdrop-blur-xl backdrop-saturate-150",
            "border border-white/[0.08]",
            "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
          ],
          variant === "subtle" && [
            "bg-white/[0.02] backdrop-blur-md backdrop-saturate-125",
            "border border-white/[0.05]",
            "shadow-lg",
          ],
          variant === "premium" && [
            "bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent",
            "backdrop-blur-2xl backdrop-saturate-200",
            "border border-white/[0.1]",
            "shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]",
          ],
          variant === "beam" && [
            "bg-gradient-to-br from-primary/[0.08] via-transparent to-emerald-500/[0.05]",
            "backdrop-blur-xl backdrop-saturate-150",
            "border border-primary/[0.15]",
            "shadow-[0_8px_32px_rgba(16,185,129,0.15)]",
          ],
          // Hover effects
          hover && [
            "hover:-translate-y-1",
            "hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]",
            "hover:border-white/[0.15]",
            variant === "beam" && "hover:shadow-[0_20px_40px_rgba(16,185,129,0.25)]",
          ],
          // Glow effect
          glow && "glow-primary",
          className
        )}
        {...props}
      >
        {/* Inner glow effect for premium variant */}
        {variant === "premium" && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        )}

        {/* Content */}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";

// Glass Card Header
const GlassCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
GlassCardHeader.displayName = "GlassCardHeader";

// Glass Card Title
const GlassCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
GlassCardTitle.displayName = "GlassCardTitle";

// Glass Card Description
const GlassCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
GlassCardDescription.displayName = "GlassCardDescription";

// Glass Card Content
const GlassCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
GlassCardContent.displayName = "GlassCardContent";

// Glass Card Footer
const GlassCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
GlassCardFooter.displayName = "GlassCardFooter";

export {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
};
