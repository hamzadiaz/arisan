"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { MiniDial } from "@/components/bezel/mini-dial";
import { Icon } from "@/components/bezel/icons";
import { Button, CodeBoxes, Label, LowFunds, Note } from "@/components/bezel/kit";
import { dialFromPoolOnly } from "@/components/bezel/dial-spec";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useBalance } from "@/hooks/use-balance";
import type { FetchedPool } from "@/lib/solana/accounts";
import { formatAmount } from "@/lib/format";
import { poolToasts, txErrorToast, dismissToast } from "@/lib/solana/transaction-toast";

const CODE_LENGTH = 8;
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
// Joining pays rent for the member account (about 0.002 SOL) plus the fee.
const JOIN_COST = 0.005;

export default function JoinPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { getPoolByInviteCode } = useSolanaPoolData();
  const { joinPool, isLoading: joining } = useSolanaPoolActions();
  const balance = useBalance();
  const card = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  const [code, setCode] = useState("");
  const [pool, setPool] = useState<FetchedPool | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A shared invite link (/join?code=…) fills the boxes and looks the circle up, once.
  // Read from the URL itself: useSearchParams would need a Suspense boundary on a static page.
  const linkedOnce = useRef(false);
  useEffect(() => {
    if (linkedOnce.current) return;
    linkedOnce.current = true;
    const linked = normalizeCode(new URLSearchParams(window.location.search).get("code") ?? "");
    if (linked.length !== CODE_LENGTH) return;
    setCode(linked);
    setSearching(true);
    getPoolByInviteCode(linked)
      .then(
        (found) => {
          setPool(found);
          setNotFound(!found);
        },
        (error) => {
          console.error("Invite lookup failed:", error);
          setLookupFailed(true);
        }
      )
      .finally(() => setSearching(false));
  }, [getPoolByInviteCode]);

  // Move focus to the result so screen readers hear it; the Find button unmounts.
  useEffect(() => {
    if (pool) card.current?.focus();
  }, [pool]);

  const updateCode = (raw: string) => {
    setCode(normalizeCode(raw));
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
    await getPoolByInviteCode(code).then(
      (found) => {
        setPool(found);
        setNotFound(!found);
      },
      (error) => {
        // An unreachable network is not the same as a wrong code
        console.error("Invite lookup failed:", error);
        setLookupFailed(true);
      }
    );
    setSearching(false);
  };

  const stakeEach = pool?.stakeEnabled ? pool.monthlyAmount * (pool.stakeMultiplier || 1) : 0;
  // Auto circles take the stake in the join itself
  const joinStake = pool?.autoMode ? stakeEach : 0;
  const full = !!pool && pool.memberCount >= pool.maxMembers;
  const short = connected && balance.sol !== null && balance.sol < joinStake + JOIN_COST;

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
      if (alive.current) router.push(`/pools/${pool.onChainAddress}`);
    } else if (/already in use/i.test(result.error ?? "")) {
      toast("You’re already in this circle");
      if (alive.current) router.push(`/pools/${pool.onChainAddress}`);
    } else {
      txErrorToast(result.error || "Could not join this circle");
    }
  };

  const [amount, currency] = pool ? formatAmount(pool.monthlyAmount, pool.currency).split(" ") : ["", ""];

  return (
    <AppShell title="Join a circle" back>
      <div className="pt-5">
        <CodeBoxes
          value={code}
          onChange={updateCode}
          onEnter={find}
          state={notFound ? "error" : pool ? "found" : "idle"}
          readOnly={searching || joining}
          describedBy="join-code-help"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p id="join-code-help" role="status" className={notFound ? "bz-help bz-help-signal m-0" : "bz-help m-0"}>
            {notFound ? "No circle with that code." : "Ask the host for the code."}
          </p>
          <button onClick={paste} disabled={searching || joining} className="bz-hit inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-card px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.98]">
            <Icon name="paste" className="size-4" />
            Paste
          </button>
        </div>

        {lookupFailed && (
          <Note tone="signal" icon="offline" className="mt-4">
            Can&rsquo;t reach Solana. Check your connection.
          </Note>
        )}

        {!pool && (
          <Button
            className="mt-6"
            icon={lookupFailed ? "refresh" : undefined}
            onClick={find}
            disabled={code.length !== CODE_LENGTH}
            busy={searching}
            busyLabel="Looking up…"
          >
            {lookupFailed ? "Try again" : "Find circle"}
          </Button>
        )}

        {pool && (
          <>
            <div ref={card} tabIndex={-1} role="region" aria-label={`Found: ${pool.name}`} className="mt-5 rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)] outline-none">
              <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5">
                <MiniDial spec={dialFromPoolOnly(pool)} className="size-14" />
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em]">{pool.name}</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">{`${amount} ${currency}`}</span> per round
                  </p>
                </div>
                <StatusPill status={pool.status} label={pool.status === "pending" && full ? "Full" : undefined} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
                <div>
                  <dt>
                    <Label>Seats</Label>
                  </dt>
                  <dd className="mt-1.5 text-[16px] font-medium tabular-nums">
                    {pool.memberCount}/{pool.maxMembers}
                  </dd>
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
                  <dd className="mt-1.5 text-[16px] font-medium tabular-nums">{stakeEach > 0 ? formatAmount(stakeEach, pool.currency) : "None"}</dd>
                </div>
              </dl>
            </div>

            <Button className="mt-5" onClick={join} disabled={pool.status !== "pending" || full || short} busy={joining}>
              {pool.status !== "pending"
                ? "Already started"
                : full
                  ? "Circle is full"
                  : !connected
                    ? "Connect wallet to join"
                    : joinStake > 0
                        ? `Join · ${formatAmount(joinStake, pool.currency)} stake`
                        : "Join circle"}
            </Button>
            {pool.status === "pending" && !full && connected && (
              <p className="bz-help text-center">
                {short ? (
                  <LowFunds />
                ) : pool.autoMode ? (
                  joinStake > 0 ? "Your stake goes in now. Starts when full." : "Starts when full."
                ) : stakeEach > 0 ? (
                  "Your wallet asks you to approve. The stake comes after."
                ) : (
                  "Your wallet asks you to approve."
                )}
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
