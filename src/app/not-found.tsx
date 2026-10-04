import Link from "next/link";
import { AppShell } from "@/components/mobile/app-shell";
import { Dial } from "@/components/bezel/dial";
import { EmptyState } from "@/components/bezel/kit";
import { EMPTY_DIAL } from "@/components/bezel/dial-spec";

export default function NotFound() {
  return (
    <AppShell title="Not found" back>
      <EmptyState
        art={<Dial spec={EMPTY_DIAL} size={220} />}
        title="Nothing at this address"
        action={
          <Link href="/" className="bz-button bz-button-ghost">
            Go home
          </Link>
        }
      >
        The link may be old or mistyped.
      </EmptyState>
    </AppShell>
  );
}
