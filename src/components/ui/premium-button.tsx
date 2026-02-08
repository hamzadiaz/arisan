"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumButtonProps {
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ className, children, variant = "default", size = "default", disabled, type = "button", onClick }, ref) => {
    const [isHovered, setIsHovered] = useState(false);
    const buttonRef = useRef<HTMLDivElement>(null);

    const sizeClasses = {
      default: "h-11 px-6 text-sm",
      sm: "h-9 px-4 text-xs",
      lg: "h-14 px-8 text-base",
    };

    if (variant === "outline") {
      const isFullWidth = className?.includes("w-full");
      return (
        <motion.div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn("relative group", className)}
        >
          {/* Subtle glow on hover */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 0.3 : 0 }}
            className="absolute -inset-1 bg-primary/30 rounded-xl blur-lg z-0"
          />

          <motion.button
            ref={ref}
            type={type}
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={disabled}
            className={cn(
              "relative z-10 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300",
              "bg-transparent border-2 border-white/20 text-white",
              "hover:border-primary/60 hover:bg-primary/10 hover:text-primary",
              "disabled:opacity-50 disabled:pointer-events-none",
              sizeClasses[size],
              isFullWidth && "w-full"
            )}
          >
            {children}
          </motion.button>
        </motion.div>
      );
    }

    if (variant === "ghost") {
      return (
        <motion.button
          ref={ref}
          type={type}
          onClick={onClick}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={disabled}
          className={cn(
            "relative rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300",
            "bg-transparent text-white/70 hover:text-white hover:bg-white/5",
            "disabled:opacity-50 disabled:pointer-events-none",
            sizeClasses[size],
            className
          )}
        >
          {children}
        </motion.button>
      );
    }

    // Check if w-full is in className
    const isFullWidth = className?.includes("w-full");

    // Default variant - premium filled button
    return (
      <motion.div
        ref={buttonRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn("relative group", className)}
      >
        {/* Outer Glow */}
        <motion.div
          initial={{ opacity: 0.3, scale: 0.95 }}
          animate={{
            opacity: isHovered ? 0.6 : 0.3,
            scale: isHovered ? 1.05 : 0.95,
          }}
          transition={{ duration: 0.3 }}
          className="absolute -inset-1 bg-primary/50 rounded-xl blur-lg z-0"
        />

        {/* Border beam effect */}
        <div className={cn(
          "relative rounded-xl p-[2px] overflow-hidden bg-gradient-to-b from-primary/50 to-primary/20",
          isFullWidth && "w-full"
        )}>
          {/* Animated border */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-200%] w-[500%] h-[500%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_60deg,rgba(255,255,255,0.4)_90deg,transparent_120deg,transparent_360deg)] opacity-60"
            style={{ top: "-200%", left: "-200%" }}
          />

          <motion.button
            ref={ref}
            type={type}
            onClick={onClick}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            disabled={disabled}
            className={cn(
              "relative z-10 rounded-[10px] font-bold flex items-center justify-center gap-2 overflow-hidden",
              "bg-gradient-to-b from-primary to-emerald-600 text-black",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.1)]",
              "disabled:opacity-50 disabled:pointer-events-none",
              sizeClasses[size],
              isFullWidth && "w-full"
            )}
          >
            {/* Shine effect */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: isHovered ? "100%" : "-100%" }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
            />

            {/* Content */}
            <span className="relative z-10 flex items-center gap-2">{children}</span>
          </motion.button>
        </div>
      </motion.div>
    );
  }
);

PremiumButton.displayName = "PremiumButton";

export { PremiumButton };
