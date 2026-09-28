"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/format";

export function WalletChip() {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-opacity active:opacity-80"
      >
        Connect
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        disconnect();
        toast("Wallet disconnected");
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2.5 text-sm font-medium transition-opacity active:opacity-80"
      aria-label="Disconnect wallet"
    >
      {wallet?.adapter.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wallet.adapter.icon} alt="" className="size-6 rounded-full" />
      ) : (
        <span className="size-6 rounded-full bg-primary/20" />
      )}
      <span className="font-mono text-xs">{shortAddress(publicKey.toBase58())}</span>
      <LogOut className="size-3 text-muted-foreground" />
    </button>
  );
}

export function ConnectWalletButton({ className }: { className?: string }) {
  const { setVisible } = useWalletModal();
  const { connecting } = useWallet();

  return (
    <button
      onClick={() => setVisible(true)}
      disabled={connecting}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:opacity-40",
        className
      )}
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
