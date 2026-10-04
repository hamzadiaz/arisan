"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { Icon } from "@/components/bezel/icons";
import { Button } from "@/components/bezel/kit";
import { useBalance } from "@/hooks/use-balance";
import { addressExplorerLink, NETWORK, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export function WalletChip() {
  const { publicKey, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);

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

  const address = publicKey.toBase58();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="bz-hit inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-card pl-2.5 pr-3 font-mono text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.98]"
        aria-label={`Wallet ${shortAddress(address)}`}
      >
        <span aria-hidden="true" className="bz-dot bz-dot-paid size-[7px]" />
        {shortAddress(address)}
      </Dialog.Trigger>
      {open && <WalletSheet address={address} onClose={() => setOpen(false)} />}
    </Dialog.Root>
  );
}

function WalletSheet({ address, onClose }: { address: string; onClose: () => void }) {
  const { disconnect, wallet } = useWallet();
  const { sol } = useBalance();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy. Long-press the address instead.");
    }
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="bz-sheet-overlay fixed inset-0 z-50" />
      <Dialog.Content className="bz-sheet fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line-2)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Dialog.Title className="text-[20px] font-semibold tracking-[-0.02em]">Your wallet</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-[13px] text-muted-foreground">
              {wallet?.adapter.name ?? "Connected"} · {NETWORK === "mainnet-beta" ? "Mainnet" : "Devnet"}
            </Dialog.Description>
          </div>
          <Dialog.Close className="bz-hit -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)]" aria-label="Close">
            <Icon name="close" className="size-[18px]" />
          </Dialog.Close>
        </div>

        <button
          onClick={copy}
          className="mt-4 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-card px-4 py-3.5 text-left shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.99]"
          aria-label={copied ? "Address copied" : "Copy address"}
        >
          <span className="break-all font-mono text-[13px] leading-snug">{address}</span>
          <span className={cn("flex items-center gap-1 text-[12.5px] font-semibold", copied ? "text-glow" : "text-gold-hi")}>
            <Icon name={copied ? "check" : "copy"} className="size-4" />
            {copied ? "Copied" : "Copy"}
          </span>
        </button>

        <div className="mt-3 flex items-center justify-between px-1">
          <span className="bz-label">Balance</span>
          <span className="font-mono text-[15px] tabular-nums">{sol === null ? "…" : `${sol.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <a href={addressExplorerLink(address)} target="_blank" rel="noopener noreferrer" className="bz-button bz-button-ghost">
            <Icon name="external" className="size-[18px]" />
            Explorer
          </a>
          {NETWORK !== "mainnet-beta" ? (
            <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="bz-button bz-button-ghost">
              <Icon name="coin" className="size-[18px]" />
              Get SOL
            </a>
          ) : (
            <span />
          )}
        </div>
        <Button
          tone="quiet"
          className="mt-2.5 text-signal"
          onClick={() => {
            onClose();
            disconnect();
            toast("Wallet disconnected");
          }}
        >
          Disconnect
        </Button>
      </Dialog.Content>
    </Dialog.Portal>
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
