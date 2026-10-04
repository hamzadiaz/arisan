"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/mobile/app-shell";
import { MiniDial } from "@/components/bezel/mini-dial";
import { EmptyState } from "@/components/bezel/kit";
import { EMPTY_DIAL } from "@/components/bezel/dial-spec";

// Route-level errors render inside the shell so the header (home, theme, wallet)
// stays usable instead of falling back to a bare error page.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <AppShell title="Error" back>
      <EmptyState
        art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
        title="This screen hit an error"
        action={
          <>
            <button onClick={reset} className="bz-button bz-button-gold">
              Try again
            </button>
            <Link href="/" className="bz-button bz-button-ghost">
              Go home
            </Link>
          </>
        }
      >
        Try again, or go back Home.
      </EmptyState>
    </AppShell>
  );
}
