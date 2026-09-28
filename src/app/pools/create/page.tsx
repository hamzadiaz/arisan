"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, Minus, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PrimaryButton, SecondaryButton, Section } from "@/components/mobile/app-shell";
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
  const [stake, setStake] = useState<0 | 1 | 2 | 3>(1);
  const stakeEnabled = stake > 0;
  const stakeMultiplier = (stake || 1) as 1 | 2 | 3;
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
          className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:border-primary"
          disabled={isLoading}
        />
      </Section>

      <Section title="Per round">
        <div className="flex h-14 items-center rounded-xl border border-border bg-card px-4 focus-within:border-primary">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmountInput(e.target.value, SOL_DECIMALS))}
            placeholder="0.5"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight tabular-nums outline-none"
            disabled={isLoading}
          />
          <span className="shrink-0 text-sm font-medium text-muted-foreground">SOL</span>
        </div>
      </Section>

      <Section title="Members">
        <div className="flex h-14 items-center justify-between rounded-xl border border-border bg-card px-1.5">
          <button
            onClick={() => setMembers((m) => Math.max(MIN_MEMBERS, m - 1))}
            disabled={members <= MIN_MEMBERS || isLoading}
            className="flex size-11 items-center justify-center rounded-lg active:bg-muted disabled:opacity-30"
            aria-label="Fewer members"
          >
            <Minus className="size-5" />
          </button>
          <div className="text-center leading-tight">
            <p className="text-xl font-semibold tabular-nums">{members}</p>
            <p className="text-[11px] text-muted-foreground">{members} rounds</p>
          </div>
          <button
            onClick={() => setMembers((m) => Math.min(MAX_MEMBERS, m + 1))}
            disabled={members >= MAX_MEMBERS || isLoading}
            className="flex size-11 items-center justify-center rounded-lg active:bg-muted disabled:opacity-30"
            aria-label="More members"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </Section>

      <Section
        title="Stake"
        action={<span className="text-[13px] text-muted-foreground">Refunded at the end</span>}
      >
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
          {([0, 1, 2, 3] as const).map((m) => (
            <button
              key={m}
              onClick={() => setStake(m)}
              disabled={isLoading}
              aria-pressed={stake === m}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                stake === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {m === 0 ? "None" : `${m}×`}
            </button>
          ))}
        </div>
      </Section>

      <div className="mb-4 flex justify-between gap-4 border-t border-border px-1 pt-4">
        <div>
          <p className="text-[13px] text-muted-foreground">Pot</p>
          <p className="font-semibold tabular-nums">{formatAmount(value * members, currency)}</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-muted-foreground">Stake each</p>
          <p className="font-semibold tabular-nums">
            {stakeEnabled ? formatAmount(value * stakeMultiplier, currency) : "None"}
          </p>
        </div>
      </div>

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
    <div className="flex flex-col gap-3">
      <div className="px-1 pb-1">
        <p className="text-[13px] text-muted-foreground">Pool created</p>
        <h2 className="truncate text-xl font-semibold">{created.name}</h2>
      </div>

      {code ? (
        <>
          <button
            onClick={copy}
            className="rounded-xl border border-border bg-card px-4 py-5 text-center active:opacity-80"
          >
            <p className="font-mono text-3xl font-semibold tracking-[0.25em]">{code}</p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Tap to copy"}
            </p>
          </button>
          <p className="px-1 text-[13px] text-amber-700 dark:text-amber-300">
            Shown once. Save it now.
          </p>

          <PrimaryButton onClick={share} className="mt-2">
            <Share2 className="size-4" />
            Share invite
          </PrimaryButton>
        </>
      ) : (
        <p className="px-1 text-sm text-amber-700 dark:text-amber-300">Couldn&apos;t read the invite code.</p>
      )}

      <SecondaryButton onClick={() => router.push(`/pools/${created.poolAddress}`)}>
        Open pool
      </SecondaryButton>
    </div>
  );
}
