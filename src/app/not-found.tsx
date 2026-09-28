import Link from "next/link";
import { AppShell, Panel } from "@/components/mobile/app-shell";

export default function NotFound() {
  return (
    <AppShell title="Not found" back>
      <Panel className="py-10 text-center">
        <p className="font-semibold">This page doesn&apos;t exist</p>
        <p className="mt-1 text-sm text-muted-foreground">Check the link, or start from Home.</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-primary">
          Go home
        </Link>
      </Panel>
    </AppShell>
  );
}
