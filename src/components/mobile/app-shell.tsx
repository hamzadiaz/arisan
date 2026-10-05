"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { introSeen, subscribeIntro } from "@/components/onboarding/intro-store";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WalletChip } from "@/components/mobile/wallet-button";
import { WalletModalA11y } from "@/components/mobile/wallet-modal-a11y";
import { Icon, type IconName } from "@/components/bezel/icons";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/pools/create", label: "Create", icon: "create" },
  { href: "/join", label: "Join", icon: "join" },
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
  const introDone = useSyncExternalStore(subscribeIntro, introSeen, () => true);
  // A hairline under the header once content scrolls beneath it
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 4);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  useEffect(() => {
    if (pathname !== lastPath) {
      inAppScreens += 1;
      lastPath = pathname;
    }
  }, [pathname]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <header
        className={cn(
          "sticky top-0 z-40 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-shadow",
          scrolled && "shadow-[inset_0_-1px_0_var(--border)]",
          !introDone && "invisible pointer-events-none"
        )}
      >
        <div className="flex h-[60px] items-center gap-2 px-4">
          {back ? (
            <button
              onClick={() => (inAppScreens > 1 ? router.back() : router.push("/"))}
              className="bz-ring-btn -ml-0.5"
              aria-label="Back"
            >
              <Icon name="back" className="size-5" />
            </button>
          ) : (
            <Link href="/" className="flex shrink-0 items-center" aria-label="Arisan home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/seal-compact.svg" alt="" width={34} height={34} className="size-[34px]" />
            </Link>
          )}
          <h1
            className={cn(
              "min-w-0 flex-1 truncate",
              back ? "pl-1 text-[17px] font-semibold tracking-[-0.01em]" : "bz-wordmark pl-1.5"
            )}
          >
            {title ?? "Arisan"}
          </h1>
          <ThemeToggle />
          <WalletChip />
        </div>
      </header>

      <WalletModalA11y />
      <main className="flex-1 overflow-x-clip px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-1">{children}</main>

      {/* A floating dock: Home and Join either side, Create as the gold coin in the middle */}
      <nav
        hidden={!introDone}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] px-4 pb-[calc(10px+env(safe-area-inset-bottom))]"
      >
        <ul className="bz-dock pointer-events-auto">
          {NAV.map(({ href, label, icon }) => {
            // A circle's own page belongs to Home: that's where its card lives.
            const onCircle = pathname.startsWith("/pools/") && pathname !== "/pools/create";
            const active = href === "/" ? pathname === "/" || onCircle : pathname.startsWith(href);
            const coin = href === "/pools/create";
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={cn("bz-dock-item", coin && "bz-dock-coin", active ? "text-primary" : "text-muted-foreground")}
                >
                  {coin ? (
                    <span aria-hidden="true" className="bz-coin-btn">
                      <Icon name="plus" className="size-6" strokeWidth={2.2} />
                    </span>
                  ) : (
                    <Icon name={icon} className="size-6" />
                  )}
                  <span>{label}</span>
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
    <section className="mb-6">
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-0.5">
          {title && <h2 className="bz-label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]", className)}>{children}</div>;
}

export function PrimaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("bz-button bz-button-gold", className)} />;
}

export function SecondaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("bz-button bz-button-ghost", className)} />;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Filling",
  active: "Active",
  completed: "Done",
  cancelled: "Cancelled",
};

// Status reads the same everywhere: a dot whose shape says the state, then the word.
const STATUS_DOT: Record<string, "paid" | "off" | "won"> = { pending: "off", active: "paid", completed: "won", cancelled: "off" };

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className="bz-status">
      <span aria-hidden="true" className={cn("bz-dot", `bz-dot-${STATUS_DOT[status] ?? "off"}`)} />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RoundBar({ round, total }: { round: number; total: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {Array.from({ length: Math.max(1, total) }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-full", i < round - 1 ? "bg-gold" : i === round - 1 ? "bg-glow" : "bg-[var(--line-2)]")}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {round}/{total}
      </span>
    </div>
  );
}
