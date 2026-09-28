"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, Minus, Plus, Share2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Panel, PrimaryButton, SecondaryButton, Section } from "@/components/mobile/app-shell";
import { useSolanaPoolActions } from "@/hooks/use-solana-program";
import { clampUtf8, formatAmount, sanitizeAmountInput } from "@/lib/format";
import { poolToasts, txErrorToast, dismissToast } from "@/lib/solana/transaction-toast";
import { cn } from "@/lib/utils";

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 20;
// The program stores the name in 32 bytes and rejects longer UTF-8, not 32 characters.
const NAME_MAX_BYTES = 32;
const SOL_DECIMALS = 9;

type Created = { poolAddress: string; inviteCode?: string; name: string };

export default function CreatePoolPage() {
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <AppShell title={created ? "Pool created" : "New pool"} back>
      {created ? <InviteOnce created={created} /> : <CreateForm onCreated={setCreated} />}
    </AppShell>
  );
}

function CreateForm({ onCreated }: { onCreated: (c: Created) => void }) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { createPool, isLoading } = useSolanaPoolActions();

  const [name, setName] = useState("");
  const [members, setMembers] = useState(5);
  const [amount, setAmount] = useState("");
  const [stakeEnabled, setStakeEnabled] = useState(true);
  const [stakeMultiplier, setStakeMultiplier] = useState<1 | 2 | 3>(1);
  const currency = "SOL" as const;

  const value = parseFloat(amount) || 0;
  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const valid = nameBytes > 0 && nameBytes <= NAME_MAX_BYTES && value > 0;

  const submit = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    if (!valid) return;

    const toastId = poolToasts.creating();
    const result = await createPool({
      name: name.trim(),
      maxMembers: members,
      contributionAmount: value,
      currency,
      stakeMultiplier,
      stakeEnabled,
      autoMode: false,
    });
    dismissToast(toastId);

    if (result.success && result.poolAddress) {
      poolToasts.created(result.signature!);
      onCreated({ poolAddress: result.poolAddress, inviteCode: result.inviteCode, name: name.trim() });
    } else {
      txErrorToast(result.error || "Could not create pool");
    }
  };

  return (
    <div>
      <Section title="Name">
        <input
          value={name}
          onChange={(e) => setName(clampUtf8(e.target.value, NAME_MAX_BYTES))}
          placeholder="Family circle"
          className="h-14 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:border-primary"
          disabled={isLoading}
        />
      </Section>

      <Section title="Amount per round">
        <div className="flex h-20 items-center rounded-2xl border border-border bg-card px-4 focus-within:border-primary">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmountInput(e.target.value, SOL_DECIMALS))}
            placeholder="0.5"
            className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none"
            disabled={isLoading}
          />
          <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1 text-sm font-semibold">
            <span className="rounded-lg bg-background px-3 py-1.5 shadow-sm">SOL</span>
            <span className="px-3 py-1.5 text-muted-foreground" title="USDC pools are coming soon">
              USDC <span className="text-[10px] font-medium">soon</span>
            </span>
          </div>
        </div>
      </Section>

      <Section title="Members">
        <Panel className="flex items-center justify-between py-3">
          <button
            onClick={() => setMembers((m) => Math.max(MIN_MEMBERS, m - 1))}
            disabled={members <= MIN_MEMBERS || isLoading}
            className="flex size-12 items-center justify-center rounded-xl bg-muted disabled:opacity-40 active:scale-95"
            aria-label="Fewer members"
          >
            <Minus className="size-5" />
          </button>
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{members}</p>
            <p className="text-xs text-muted-foreground">{members} rounds</p>
          </div>
          <button
            onClick={() => setMembers((m) => Math.min(MAX_MEMBERS, m + 1))}
            disabled={members >= MAX_MEMBERS || isLoading}
            className="flex size-12 items-center justify-center rounded-xl bg-muted disabled:opacity-40 active:scale-95"
            aria-label="More members"
          >
            <Plus className="size-5" />
          </button>
        </Panel>
      </Section>

      <Section title="Commitment stake">
        <Panel className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">Require a stake</span>
              <span className="block text-sm text-muted-foreground">
                Refunded at the end. Covers missed payments.
              </span>
            </span>
            <input
              type="checkbox"
              checked={stakeEnabled}
              onChange={(e) => setStakeEnabled(e.target.checked)}
              className="peer sr-only"
              disabled={isLoading}
            />
            <span
              aria-hidden
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                stakeEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                  stakeEnabled ? "translate-x-5.5" : "translate-x-0.5"
                )}
              />
            </span>
          </label>
          {stakeEnabled && (
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setStakeMultiplier(m)}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-semibold",
                    stakeMultiplier === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border"
                  )}
                >
                  {m}× round
                </button>
              ))}
            </div>
          )}
        </Panel>
      </Section>

      <Panel className="mb-6 grid grid-cols-2 gap-4 bg-muted/50">
        <div>
          <p className="text-xs text-muted-foreground">Pot each round</p>
          <p className="text-lg font-bold">{formatAmount(value * members, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stake per member</p>
          <p className="text-lg font-bold">
            {stakeEnabled ? formatAmount(value * stakeMultiplier, currency) : "None"}
          </p>
        </div>
      </Panel>

      <PrimaryButton onClick={submit} disabled={isLoading || (connected && !valid)}>
        {!connected ? "Connect wallet to create" : isLoading ? "Confirm in wallet…" : "Create pool"}
      </PrimaryButton>
    </div>
  );
}

function InviteOnce({ created }: { created: Created }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const code = created.inviteCode;

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Invite code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!code) return;
    const text = `Join my Arisan savings circle "${created.name}" with code ${code}`;
    if (navigator.share) {
      await navigator.share({ title: "Arisan invite", text, url: `${window.location.origin}/join` }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${text} — ${window.location.origin}/join`);
      toast.success("Invite copied");
    }
  };

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="size-7" />
        </div>
        <h2 className="text-2xl font-bold">{created.name} is live</h2>
        <p className="mt-1 text-sm text-muted-foreground">Share this code with the people you trust.</p>
      </div>

      {code ? (
        <>
          <button
            onClick={copy}
            className="rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-6 text-center active:scale-[0.99]"
          >
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-primary">{code}</p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Tap to copy"}
            </p>
          </button>

          <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <p>
              <span className="font-semibold">Shown once.</span> Only a hash is stored on-chain, so
              Arisan can&apos;t show this code again. Save or share it now.
            </p>
          </div>

          <PrimaryButton onClick={share}>
            <Share2 className="size-5" />
            Share invite
          </PrimaryButton>
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <p>The pool was created, but the invite code could not be read back from the network.</p>
        </div>
      )}

      <SecondaryButton onClick={() => router.push(`/pools/${created.poolAddress}`)}>
        Open pool
      </SecondaryButton>
    </div>
  );
}
