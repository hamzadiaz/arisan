"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppShell, Panel } from "@/components/mobile/app-shell";

// Route-level errors render inside the shell so the header (home, theme, wallet)
// stays usable instead of falling back to a bare error page.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <AppShell title="Something went wrong" back>
      <Panel className="py-10 text-center">
        <p className="font-semibold">This screen hit an error</p>
        <p className="mt-1 text-sm text-muted-foreground">Try again, or go back Home.</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button onClick={reset} className="h-11 rounded-xl bg-muted px-4 text-sm font-semibold active:scale-95">
            Try again
          </button>
          <Link href="/" className="font-semibold text-primary">
            Go home
          </Link>
        </div>
      </Panel>
    </AppShell>
  );
}
