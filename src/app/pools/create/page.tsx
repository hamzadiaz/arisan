"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { AppShell } from "@/components/mobile/app-shell";
import { Dial } from "@/components/bezel/dial";
import { Icon } from "@/components/bezel/icons";
import { Button, Label, Note, SeatRuler, Segmented } from "@/components/bezel/kit";
import { useSolanaPoolActions } from "@/hooks/use-solana-program";
import { clampUtf8, formatAmount, sanitizeAmountInput } from "@/lib/format";
import { poolToasts, txErrorToast, dismissToast } from "@/lib/solana/transaction-toast";

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 20;
// The program stores the name in 32 bytes and rejects longer UTF-8, not 32 characters.
const NAME_MAX_BYTES = 32;
const SOL_DECIMALS = 9;
const STAKES = [0, 1, 2, 3] as const;

type Created = { poolAddress: string; inviteCode?: string; name: string; seats: number };

export default function CreatePoolPage() {
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <AppShell title={created ? "Circle created" : "New circle"} back>
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
      onCreated({ poolAddress: result.poolAddress, inviteCode: result.inviteCode, name: name.trim(), seats: members });
    } else {
      txErrorToast(result.error || "Could not create the circle");
    }
  };

  return (
    <div className="pt-1">
      <Dial
        spec={{ seats: members, mode: "pending", open: Array.from({ length: members }, (_, i) => i) }}
        size={190}
        view="create"
        label={`Preview: a circle with ${members} seats`}
      />

      <SeatRuler value={members} min={MIN_MEMBERS} max={MAX_MEMBERS} onChange={setMembers} disabled={isLoading} />

      <label className="bz-field mt-4">
        <Label>Name</Label>
        <input
          value={name}
          onChange={(e) => setName(clampUtf8(e.target.value, NAME_MAX_BYTES))}
          placeholder="Family circle"
          disabled={isLoading}
          style={{ textAlign: "left" }}
        />
      </label>

      <label className="bz-field mt-2.5">
        <Label>Per round</Label>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(sanitizeAmountInput(e.target.value, SOL_DECIMALS))}
          placeholder="0.5"
          disabled={isLoading}
          className="tabular-nums"
        />
        <span className="bz-label">SOL</span>
      </label>

      <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 px-1">
        <Label>Stake</Label>
        <span className="text-[12px] text-muted-foreground">Returned at the end if you pay every round</span>
      </div>
      <Segmented
        label="Stake"
        options={STAKES}
        value={stake}
        onChange={(v) => setStake(v)}
        disabled={isLoading}
        render={(m) => (m === 0 ? "None" : `${m}×`)}
      />

      <div className="mt-5 flex justify-between gap-4 px-1">
        <div>
          <p className="bz-label">Pot</p>
          <p className="mt-1 text-[18px] font-medium tabular-nums">{formatAmount(value * members, currency)}</p>
        </div>
        <div className="text-right">
          <p className="bz-label">Stake each</p>
          <p className="mt-1 text-[18px] font-medium tabular-nums">{stakeEnabled ? formatAmount(value * stakeMultiplier, currency) : "None"}</p>
        </div>
      </div>

      <Button className="mt-5" onClick={submit} disabled={connected && !valid} busy={isLoading}>
        {!connected ? "Connect wallet to create" : "Create circle"}
      </Button>
    </div>
  );
}

function InviteOnce({ created }: { created: Created }) {
  const router = useRouter();
  const { joinPool, isLoading: joining } = useSolanaPoolActions();
  const [copied, setCopied] = useState(false);
  const code = created.inviteCode;
  const open = () => router.push(`/pools/${created.poolAddress}`);

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Invite code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!code) return;
    const text = `Join my Arisan circle "${created.name}" with code ${code}`;
    if (navigator.share) {
      await navigator.share({ title: "Arisan invite", text, url: `${window.location.origin}/join` }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${text} — ${window.location.origin}/join`);
      toast.success("Invite copied");
    }
  };

  // The creator isn't seated by create_pool; joining with the code takes the first seat.
  const takeSeat = async () => {
    if (!code) return;
    const toastId = poolToasts.joining();
    const result = await joinPool({ poolAddress: new PublicKey(created.poolAddress), inviteCode: code });
    dismissToast(toastId);
    if (result.success) {
      poolToasts.joined(result.signature!);
      open();
    } else {
      txErrorToast(result.error || "Could not take your seat");
    }
  };

  const ring = { seats: created.seats, mode: "pending" as const, open: Array.from({ length: created.seats }, (_, i) => i) };

  if (!code) {
    return (
      <div className="flex flex-col items-center pt-3 text-center">
        <Dial spec={ring} size={170} view="create" />
        <h2 className="bz-title mt-3">Couldn&apos;t read the invite code.</h2>
        <p className="bz-body mt-1.5 max-w-[30ch]">The circle exists, but nobody can join without the code.</p>
        <Button className="mt-6" onClick={open}>
          Open circle
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-1">
      <Dial spec={ring} size={160} view="create" />
      <h2 className="bz-title mt-2 truncate text-center">{created.name}</h2>

      <Label className="mt-5 text-center">Invite code</Label>
      <button
        onClick={copy}
        className="mt-2 flex flex-col items-center rounded-[20px] bg-card px-4 py-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gold)_40%,transparent)] active:scale-[0.99]"
      >
        <span className="font-mono text-[32px] font-medium tracking-[0.3em] text-gold-hi">{code}</span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Icon name={copied ? "check" : "copy"} className="size-3.5" />
          {copied ? "Copied" : "Tap to copy"}
        </span>
      </button>

      <Note tone="gold" icon="info" className="mt-3">
        Shown once. Save it now.
      </Note>

      <Button className="mt-5" onClick={takeSeat} busy={joining}>
        Take your seat
      </Button>
      <Button tone="ghost" icon="share" className="mt-3" onClick={share}>
        Share invite
      </Button>
      <button onClick={open} className="bz-link mx-auto mt-4 h-11">
        Open circle
      </button>
    </div>
  );
}
