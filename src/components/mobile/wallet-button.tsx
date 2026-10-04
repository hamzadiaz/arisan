"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/format";

export function WalletChip() {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="bz-hit inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold text-gold-hi shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gold)_55%,transparent)] active:scale-[0.98]"
      >
        {connecting ? "Connecting…" : "Connect"}
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        disconnect();
        toast("Wallet disconnected");
      }}
      className="bz-hit inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-card pl-2.5 pr-3 font-mono text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.98]"
      aria-label="Disconnect wallet"
    >
      <span aria-hidden="true" className="bz-dot bz-dot-paid size-[7px]" />
      {shortAddress(publicKey.toBase58())}
    </button>
  );
}

export function ConnectWalletButton({ className }: { className?: string }) {
  const { setVisible } = useWalletModal();
  const { connecting } = useWallet();

  return (
    <button onClick={() => setVisible(true)} disabled={connecting} className={cn("bz-button bz-button-gold", className)}>
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
