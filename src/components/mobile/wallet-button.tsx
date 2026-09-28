"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, LogOut } from "lucide-react";
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
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground active:scale-95 transition-transform"
      >
        <Wallet className="size-4" />
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
      className="group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3 text-sm font-medium active:scale-95 transition-transform"
      aria-label="Disconnect wallet"
    >
      {wallet?.adapter.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wallet.adapter.icon} alt="" className="size-6 rounded-full" />
      ) : (
        <span className="size-6 rounded-full bg-primary/20" />
      )}
      <span className="font-mono text-xs">{shortAddress(publicKey.toBase58())}</span>
      <LogOut className="size-3.5 text-muted-foreground" />
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
        "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-60",
        className
      )}
    >
      <Wallet className="size-5" />
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
