import Link from "next/link";
import { AppShell } from "@/components/mobile/app-shell";
import { MiniDial } from "@/components/bezel/mini-dial";
import { EmptyState } from "@/components/bezel/kit";
import { EMPTY_DIAL } from "@/components/bezel/dial-spec";

export default function NotFound() {
  return (
    <AppShell title="Not found" back>
      <EmptyState
        art={<MiniDial spec={EMPTY_DIAL} className="size-[200px]" />}
        title="This page doesn't exist"
        action={
          <Link href="/" className="bz-button bz-button-ghost">
            Go home
          </Link>
        }
      >
        Check the link, or start from Home.
      </EmptyState>
    </AppShell>
  );
}
