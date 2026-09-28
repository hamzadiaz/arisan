"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AppShell, Panel, PrimaryButton, StatusPill } from "@/components/mobile/app-shell";
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
      txErrorToast(result.error || "Could not join pool");
    }
  };

  return (
    <AppShell title="Join a pool" back>
      <div className="mb-3 flex h-14 items-center gap-2 rounded-xl border border-border bg-card pl-4 pr-1.5 focus-within:border-primary">
        <input
          value={code}
          onChange={(e) => updateCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && code.length === CODE_LENGTH && find()}
          placeholder="ABCD1234"
          aria-label="Invite code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent font-mono text-xl font-semibold tracking-[0.2em] uppercase outline-none placeholder:text-muted-foreground/40"
        />
        <button
          onClick={paste}
          className="h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-primary active:bg-muted"
        >
          Paste
        </button>
      </div>
      {notFound && <p className="-mt-1 mb-3 px-1 text-sm text-destructive">No pool with that code.</p>}
      {lookupFailed && (
        <p role="alert" className="-mt-1 mb-3 px-1 text-sm text-destructive">
          Can&apos;t reach Solana. Try again.
        </p>
      )}

      {!pool && (
        <PrimaryButton onClick={find} disabled={code.length !== CODE_LENGTH || searching}>
          {searching ? "Looking up…" : "Find pool"}
        </PrimaryButton>
      )}

      {pool && (
        <>
          <Panel className="mb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{pool.name}</p>
              <StatusPill status={pool.status} />
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {formatAmount(pool.monthlyAmount, pool.currency)}
            </p>
            <p className="text-[13px] text-muted-foreground">per round</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-[13px] text-muted-foreground">Members</dt>
                <dd className="font-medium tabular-nums">{pool.maxMembers}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Pot</dt>
                <dd className="font-medium tabular-nums">
                  {formatAmount(pool.monthlyAmount * pool.maxMembers, pool.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Stake</dt>
                <dd className="font-medium">{pool.stakeEnabled ? "Required" : "None"}</dd>
              </div>
            </dl>
          </Panel>

          <PrimaryButton onClick={join} disabled={joining || pool.status !== "pending"}>
            {pool.status !== "pending"
              ? "Already started"
              : !connected
                ? "Connect wallet to join"
                : joining
                  ? "Confirm in wallet…"
                  : "Join pool"}
          </PrimaryButton>
        </>
      )}
    </AppShell>
  );
}
