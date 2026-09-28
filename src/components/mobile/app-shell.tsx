"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Home, Plus, Ticket } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WalletChip } from "@/components/mobile/wallet-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/pools/create", label: "Create", icon: Plus },
  { href: "/join", label: "Join", icon: Ticket },
];

// Screens visited in this tab since the app loaded. Back pops in-app history when
// there is some; a deep link (shared pool URL, reload) goes Home instead of leaving.
let inAppScreens = 0;
let lastPath: string | null = null;

interface AppShellProps {
  title?: string;
  back?: boolean;
  children: React.ReactNode;
}

export function AppShell({ title, back, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== lastPath) {
      inAppScreens += 1;
      lastPath = pathname;
    }
  }, [pathname]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="flex h-14 items-center gap-1 px-4">
          {back ? (
            <button
              onClick={() => (inAppScreens > 1 ? router.back() : router.push("/"))}
              className="-ml-2 flex size-10 items-center justify-center rounded-full active:bg-muted"
              aria-label="Back"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <Link href="/" className="-ml-1 mr-1.5 flex shrink-0 items-center" aria-label="Arisan home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/arisan-icon.svg" alt="" className="size-7 rounded-lg" />
            </Link>
          )}
          <h1 className="flex-1 truncate text-[17px] font-semibold tracking-tight">
            {title ?? "Arisan"}
          </h1>
          <ThemeToggle />
          <WalletChip />
        </div>
      </header>

      <main className="flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="grid grid-cols-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("size-[22px]", active && "stroke-[2.25]")} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      {(title || action) && (
        <div className="mb-1.5 flex items-center justify-between px-1">
          {title && (
            <h2 className="text-[13px] font-medium text-muted-foreground">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>{children}</div>
  );
}

export function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-40",
        className
      )}
    />
  );
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-[15px] font-semibold transition-opacity active:opacity-80 disabled:opacity-40",
        className
      )}
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active: "bg-primary/15 text-emerald-700 dark:text-primary",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Filling",
  active: "Active",
  completed: "Done",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STATUS_STYLES[status] ?? STATUS_STYLES.completed
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RoundBar({ round, total }: { round: number; total: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${total ? Math.min(100, (round / total) * 100) : 0}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {round}/{total}
      </span>
    </div>
  );
}
