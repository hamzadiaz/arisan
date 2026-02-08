"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "feature" | "testimonial" | "stat";
  hoverEffect?: boolean;
  beamEffect?: boolean;
  cornerAccents?: boolean;
  glowOnHover?: boolean;
}

const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  (
    {
      children,
      className,
      variant = "default",
      hoverEffect = true,
      beamEffect = false,
      cornerAccents = false,
      glowOnHover = true,
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Subtle parallax for content
    const contentX = useTransform(mouseX, [-1, 1], [-5, 5]);
    const contentY = useTransform(mouseY, [-1, 1], [-5, 5]);

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!containerRef.current || !hoverEffect) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      mouseX.set((x - 0.5) * 2);
      mouseY.set((y - 0.5) * 2);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      mouseX.set(0);
      mouseY.set(0);
    };

    return (
      <motion.div
        ref={containerRef}
        className={cn("relative group", className)}
        onMouseMove={(e) => {
          handleMouseMove(e);
          setIsHovered(true);
        }}
        onMouseLeave={handleMouseLeave}
        whileHover={hoverEffect ? { y: -4 } : undefined}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Animated Border Glow */}
        <div className="absolute -inset-[1px] rounded-2xl overflow-hidden z-0">
          {/* Primary spinning gradient */}
          <motion.div
            className={cn(
              "absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_80deg,hsl(var(--primary))_120deg,transparent_160deg,transparent_360deg)]",
              "opacity-0 group-hover:opacity-60 transition-opacity duration-500"
            )}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          {/* Secondary accent gradient */}
          <motion.div
            className={cn(
              "absolute inset-[-100%] bg-[conic-gradient(from_180deg,transparent_0deg,transparent_80deg,rgba(16,185,129,0.6)_120deg,transparent_160deg,transparent_360deg)]",
              "opacity-0 group-hover:opacity-40 transition-opacity duration-500"
            )}
            animate={{ rotate: -360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Outer Glow on Hover */}
        {glowOnHover && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 0.15 : 0 }}
            transition={{ duration: 0.3 }}
            className="absolute -inset-2 bg-primary/40 rounded-3xl blur-xl z-0"
          />
        )}

        {/* Card Background */}
        <div className="absolute inset-0 bg-[#0a0a0f] rounded-2xl z-10 overflow-hidden border border-white/[0.08] group-hover:border-primary/20 transition-colors duration-300">
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent z-0" />

          {/* Corner Accents */}
          {cornerAccents && (
            <>
              <div className="absolute top-3 left-3 w-8 h-8 border-l border-t border-primary/30 rounded-tl-lg pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-8 h-8 border-r border-b border-primary/30 rounded-br-lg pointer-events-none" />
            </>
          )}
        </div>

        {/* Content */}
        <motion.div
          ref={ref}
          style={hoverEffect ? { x: contentX, y: contentY } : undefined}
          className="relative z-20"
        >
          {children}
        </motion.div>
      </motion.div>
    );
  }
);

PremiumCard.displayName = "PremiumCard";

// Feature Card - for "Why Choose Arisan" section
interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  className?: string;
  index?: number;
}

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  className,
  index = 0,
}: FeatureCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={cn("relative", className)}
    >
      <PremiumCard>
        <div className="p-6 space-y-4">
          {/* Icon Container */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-600/10 border border-primary/30 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-300">
            <Icon className="w-7 h-7 text-primary group-hover:text-black transition-colors duration-300" />
          </div>

          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-all duration-300">
              {title}
            </h3>
            <div className="h-0.5 w-0 group-hover:w-12 bg-gradient-to-r from-primary to-emerald-400 rounded-full mt-2 transition-all duration-500" />
          </div>

          {/* Description */}
          <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        </div>
      </PremiumCard>
    </motion.div>
  );
};

// Testimonial Card
interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
  className?: string;
  index?: number;
}

const TestimonialCard = ({
  quote,
  author,
  role,
  className,
  index = 0,
}: TestimonialCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={cn("relative", className)}
    >
      <PremiumCard>
        <div className="p-6 space-y-5">
          {/* Rating Stars */}
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <motion.svg
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 + i * 0.05 }}
                className="w-5 h-5 text-primary fill-primary"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </motion.svg>
            ))}
          </div>

          {/* Quote */}
          <p className="text-white/80 italic leading-relaxed">&quot;{quote}&quot;</p>

          {/* Author */}
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.08]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-emerald-600/20 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-semibold">{author[0]}</span>
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{author}</p>
              <p className="text-xs text-slate-400">{role}</p>
            </div>
          </div>
        </div>
      </PremiumCard>
    </motion.div>
  );
};

// Stat Card - for dashboard stats
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

const StatCard = ({ label, value, icon: Icon, trend, className }: StatCardProps) => {
  return (
    <PremiumCard className={className} beamEffect>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              {label}
            </p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  trend.isPositive ? "text-primary" : "text-red-400"
                )}
              >
                <span>{trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%</span>
                <span className="text-slate-500">vs last month</span>
              </div>
            )}
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>
    </PremiumCard>
  );
};

// Step Card - for "How it Works" section
interface StepCardProps {
  step: number;
  title: string;
  description: string;
  className?: string;
  isLast?: boolean;
}

const StepCard = ({ step, title, description, className, isLast }: StepCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: step * 0.1 }}
      className={cn("relative", className)}
    >
      <PremiumCard cornerAccents>
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Step Number */}
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-lg shadow-primary/30">
                <span className="text-black font-bold text-lg">{step}</span>
              </div>
              {/* Connection line */}
              {!isLast && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 w-[2px] h-8 bg-gradient-to-b from-primary/50 to-transparent" />
              )}
            </div>

            {/* Content */}
            <div className="space-y-2 pt-1">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
            </div>
          </div>
        </div>
      </PremiumCard>
    </motion.div>
  );
};

export { PremiumCard, FeatureCard, TestimonialCard, StatCard, StepCard };
