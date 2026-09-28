"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ClipboardPaste, Search } from "lucide-react";
import { AppShell, Panel, PrimaryButton, Section, StatusPill } from "@/components/mobile/app-shell";
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

  const updateCode = (raw: string) => {
    setCode(raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH));
    setPool(null);
    setNotFound(false);
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
    const found = await getPoolByInviteCode(code);
    setPool(found);
    setNotFound(!found);
    setSearching(false);
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
      <Section title="Invite code">
        <div className="flex h-16 items-center gap-2 rounded-2xl border border-border bg-card pl-4 pr-2 focus-within:border-primary">
          <input
            value={code}
            onChange={(e) => updateCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.length === CODE_LENGTH && find()}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent font-mono text-2xl font-bold tracking-[0.25em] uppercase outline-none placeholder:text-muted-foreground/40"
          />
          <button
            onClick={paste}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 text-sm font-semibold active:scale-95"
          >
            <ClipboardPaste className="size-4" />
            Paste
          </button>
        </div>
        {notFound && (
          <p className="mt-2 px-1 text-sm text-destructive">No pool matches that code. Check it and try again.</p>
        )}
      </Section>

      {!pool && (
        <PrimaryButton onClick={find} disabled={code.length !== CODE_LENGTH || searching}>
          <Search className="size-5" />
          {searching ? "Looking up…" : "Find pool"}
        </PrimaryButton>
      )}

      {pool && (
        <>
          <Panel className="mb-6">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xl font-bold">{pool.name}</p>
              <StatusPill status={pool.status} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">You pay each round</p>
            <p className="text-4xl font-bold tracking-tight">
              {formatAmount(pool.monthlyAmount, pool.currency)}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Members</dt>
                <dd className="font-semibold">{pool.maxMembers}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pot</dt>
                <dd className="font-semibold">
                  {formatAmount(pool.monthlyAmount * pool.maxMembers, pool.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stake</dt>
                <dd className="font-semibold">{pool.stakeEnabled ? "Required" : "None"}</dd>
              </div>
            </dl>
          </Panel>

          <PrimaryButton onClick={join} disabled={joining || pool.status !== "pending"}>
            {pool.status !== "pending"
              ? "This pool has already started"
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
