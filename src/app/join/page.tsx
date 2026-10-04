"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { MiniDial } from "@/components/bezel/mini-dial";
import { Icon } from "@/components/bezel/icons";
import { Button, CodeBoxes, Label, Note } from "@/components/bezel/kit";
import { dialFromPoolOnly } from "@/components/bezel/dial-spec";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import type { FetchedPool } from "@/lib/solana/accounts";
import { formatAmount } from "@/lib/format";
import { poolToasts, txErrorToast, dismissToast } from "@/lib/solana/transaction-toast";

const CODE_LENGTH = 8;

export default function JoinPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { getPoolByInviteCode } = useSolanaPoolData();
  const { joinPool, isLoading: joining } = useSolanaPoolActions();

  const [code, setCode] = useState("");
  const [pool, setPool] = useState<FetchedPool | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  const updateCode = (raw: string) => {
    setCode(raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH));
    setPool(null);
    setNotFound(false);
    setLookupFailed(false);
  };

  const paste = async () => {
    try {
      updateCode(await navigator.clipboard.readText());
    } catch {
      // Clipboard permission denied; user can type instead
    }
  };

  const find = async () => {
    if (code.length !== CODE_LENGTH || searching) return;
    setSearching(true);
    setNotFound(false);
    setLookupFailed(false);
    try {
      const found = await getPoolByInviteCode(code);
      setPool(found);
      setNotFound(!found);
    } catch (error) {
      // An unreachable network is not the same as a wrong code
      console.error("Invite lookup failed:", error);
      setLookupFailed(true);
    } finally {
      setSearching(false);
    }
  };

  const join = async () => {
    if (!pool) return;
    if (!connected) {
      setVisible(true);
      return;
    }
    const toastId = poolToasts.joining();
    const result = await joinPool({ poolAddress: new PublicKey(pool.onChainAddress), inviteCode: code });
    dismissToast(toastId);
    if (result.success) {
      poolToasts.joined(result.signature!);
      router.push(`/pools/${pool.onChainAddress}`);
    } else {
      txErrorToast(result.error || "Could not join this circle");
    }
  };

  const [amount, currency] = pool ? formatAmount(pool.monthlyAmount, pool.currency).split(" ") : ["", ""];

  return (
    <AppShell title="Join a circle" back>
      <div className="pt-5">
        <CodeBoxes value={code} onChange={updateCode} onEnter={find} state={notFound ? "error" : pool ? "found" : "idle"} />
        <div className="mt-3 flex items-center justify-between gap-3">
          {notFound ? (
            <p className="bz-help bz-help-signal m-0">No circle with that code.</p>
          ) : (
            <p className="bz-help m-0">From whoever made the circle.</p>
          )}
          <button onClick={paste} className="bz-hit inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-card px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.98]">
            <Icon name="paste" className="size-4" />
            Paste
          </button>
        </div>

        {lookupFailed && (
          <Note tone="signal" icon="offline" className="mt-4">
            Can&apos;t reach Solana. Try again.
          </Note>
        )}

        {!pool && (
          <Button className="mt-6" onClick={find} disabled={code.length !== CODE_LENGTH} busy={searching} busyLabel="Looking up…">
            Find circle
          </Button>
        )}

        {pool && (
          <>
            <div className="mt-5 rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]">
              <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5">
                <MiniDial spec={dialFromPoolOnly(pool)} className="size-14" />
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em]">{pool.name}</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    <span className="font-mono text-foreground">{`${amount} ${currency}`}</span> per round
                  </p>
                </div>
                <StatusPill status={pool.status} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
                <div>
                  <dt>
                    <Label>Seats</Label>
                  </dt>
                  <dd className="mt-1.5 text-[16px] font-medium tabular-nums">{pool.maxMembers}</dd>
                </div>
                <div>
                  <dt>
                    <Label>Pot</Label>
                  </dt>
                  <dd className="mt-1.5 text-[16px] font-medium tabular-nums">{formatAmount(pool.monthlyAmount * pool.maxMembers, pool.currency)}</dd>
                </div>
                <div>
                  <dt>
                    <Label>Stake</Label>
                  </dt>
                  <dd className="mt-1.5 text-[16px] font-medium">{pool.stakeEnabled ? "Required" : "None"}</dd>
                </div>
              </dl>
            </div>

            <Button className="mt-5" onClick={join} disabled={pool.status !== "pending"} busy={joining}>
              {pool.status !== "pending" ? "Already started" : !connected ? "Connect wallet to join" : "Join circle"}
            </Button>
            {pool.status === "pending" && connected && <p className="bz-help text-center">Your wallet asks you to approve. The stake comes after.</p>}
          </>
        )}
      </div>
    </AppShell>
  );
}
