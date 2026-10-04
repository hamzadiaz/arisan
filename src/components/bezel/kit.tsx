"use client";

import { type ButtonHTMLAttributes, type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";

// Small parts every Bezel screen is built from. Styling lives in globals.css (bz-* classes)
// so states (pressed, disabled, busy) stay identical across screens.

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("bz-label", className)}>{children}</span>;
}

type ButtonTone = "gold" | "ghost" | "quiet";

export function Button({
  tone = "gold",
  icon,
  busy = false,
  busyLabel = "Confirm in wallet…",
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; icon?: IconName; busy?: boolean; busyLabel?: string }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn("bz-button", `bz-button-${busy ? "quiet" : tone}`, className)}
    >
      {busy ? <span className="bz-spin" aria-hidden="true" /> : icon ? <Icon name={icon} className="size-[18px]" /> : null}
      {busy ? busyLabel : children}
    </button>
  );
}

export function SubDial({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: "signal" }) {
  return (
    <div className={cn("bz-subdial", tone === "signal" && "bz-subdial-signal")}>
      <span className="bz-label text-[7.5px]">{label}</span>
      <b>
        {value}
        {unit && <small>{unit}</small>}
      </b>
    </div>
  );
}

export type Tone = "paid" | "due" | "won" | "off" | "late";

export function Dot({ tone }: { tone: Tone }) {
  return <i aria-hidden="true" className={cn("bz-dot", `bz-dot-${tone}`)} />;
}

export function Status({ tone, children, strong }: { tone: Tone; children: ReactNode; strong?: boolean }) {
  return (
    <span className={cn("bz-status", strong && "text-foreground")}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export function Note({ tone = "neutral", icon = "info", children, className }: { tone?: "neutral" | "signal" | "gold"; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "signal" ? "alert" : undefined} className={cn("bz-note", tone !== "neutral" && `bz-note-${tone}`, className)}>
      <Icon name={icon} className="mt-px size-[18px]" />
      <div>{children}</div>
    </div>
  );
}

export function Pill({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "green" | "muted" }) {
  return <span className={cn("bz-pill", `bz-pill-${tone}`)}>{children}</span>;
}

/** Segmented control. Each option is a real button with aria-pressed. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
  render?: (v: T) => ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="bz-seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={String(o)} type="button" aria-pressed={value === o} disabled={disabled} onClick={() => onChange(o)}>
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * Eight boxes over one real input: typing, paste and autofill go through the input,
 * the boxes only draw its value. The caret box follows the next empty slot.
 */
export function CodeBoxes({
  value,
  onChange,
  onEnter,
  length = 8,
  state = "idle",
  disabled,
  readOnly,
  label = "Invite code",
  placeholder = "ABCD1234",
}: {
  value: string;
  onChange?: (raw: string) => void;
  onEnter?: () => void;
  length?: number;
  state?: "idle" | "error" | "found";
  disabled?: boolean;
  readOnly?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const half = length / 2;
  const chars = value.split("");
  const slots = Array.from({ length }, (_, i) => chars[i] ?? "");
  const caret = focused && !readOnly ? Math.min(chars.length, length - 1) : -1;
  return (
    <div className={cn("bz-code", state === "error" && "bz-code-error", state === "found" && "bz-code-found")} onClick={() => input.current?.focus()}>
      {slots.map((c, i) => (
        <span key={i} className={cn(i === half && "ml-[10px]", i === caret && "bz-code-caret", !c && "bz-code-empty")} aria-hidden="true">
          {c || (!focused && !value ? placeholder[i] : "")}
        </span>
      ))}
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={label}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        inputMode="text"
        disabled={disabled}
        readOnly={readOnly}
        className="bz-code-input"
      />
    </div>
  );
}

/** Seat count: a 2–20 ruler with − and + steppers. The steppers keep exact single steps. */
export function SeatRuler({ value, min = 2, max = 20, onChange, disabled }: { value: number; min?: number; max?: number; onChange: (n: number) => void; disabled?: boolean }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="bz-ruler">
      <div className="bz-ruler-head">
        <Label>Seats</Label>
        <b>
          {value}
          <small>{value} rounds</small>
        </b>
      </div>
      <button type="button" className="bz-step" onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="Fewer members">
        <Icon name="minus" className="size-4" />
      </button>
      <div className="bz-ticks" aria-hidden="true">
        {Array.from({ length: max - min + 1 }, (_, k) => {
          const n = min + k;
          return <i key={n} className={cn(n === value ? "on" : (n % 5 === 0 || n === min) && "m")} />;
        })}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-label="Seats"
        className="bz-ruler-range"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
      <button type="button" className="bz-step bz-step-r" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="More members">
        <Icon name="plus" className="size-4" />
      </button>
      <div className="bz-ruler-nums" aria-hidden="true">
        {[2, 5, 10, 15, 20].map((n) => (
          <span key={n} style={{ left: `${((n - min) / (max - min)) * 100}%` }}>
            {String(n).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ art, title, children, action }: { art?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 pt-4 text-center">
      {art}
      <h2 className="bz-title mt-2">{title}</h2>
      {children && <p className="bz-body max-w-[30ch]">{children}</p>}
      {action && <div className="mt-3 flex w-full flex-col gap-3">{action}</div>}
    </div>
  );
}

export function SkeletonDial({ size = 300 }: { size?: number }) {
  return (
    <div className="relative mx-auto aspect-square max-w-full" style={{ width: size }} aria-hidden="true">
      <div className="bz-skel-ring absolute inset-0" />
      <div className="bz-skel absolute left-1/2 top-1/2 size-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
    </div>
  );
}
