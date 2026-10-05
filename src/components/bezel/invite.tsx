"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";

// The invite code as the Created screen and the circle page show it, and the share sheet.

/** Shares a link that opens Join with the code filled in; the code is in the text too. */
export async function shareInvite(name: string, code: string) {
  const url = `${window.location.origin}/join?code=${code}`;
  const text = `Join my Arisan circle “${name}” with code ${code}`;
  if (navigator.share) {
    await navigator.share({ title: "Arisan invite", text, url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(`${text}: ${url}`);
    toast.success("Invite link copied");
  }
}

/** The code in a gold-ringed card; a tap copies it. */
export function InviteCode({ code, compact = false, className }: { code: string; compact?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Invite code copied");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={cn(
        "flex w-full flex-col items-center rounded-[20px] bg-card px-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gold)_40%,transparent)] active:scale-[0.99]",
        compact ? "py-3" : "py-4",
        className
      )}
    >
      <span className={cn("pl-[0.3em] font-mono font-medium tracking-[0.3em] text-gold-hi", compact ? "text-[24px]" : "text-[32px]")}>{code}</span>
      <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon name={copied ? "check" : "copy"} className="size-3.5" />
        {copied ? "Copied" : "Tap to copy"}
      </span>
    </button>
  );
}
