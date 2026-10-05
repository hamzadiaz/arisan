"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { AppShell, StatusPill } from "@/components/mobile/app-shell";
import { Dial } from "@/components/bezel/dial";
import { Icon } from "@/components/bezel/icons";
import { Button, CodeBoxes, Label, LowFunds, Note } from "@/components/bezel/kit";
import { dialFromPoolOnly, type DialSpec } from "@/components/bezel/dial-spec";
import { useSolanaPoolActions, useSolanaPoolData } from "@/hooks/use-solana-program";
import { useBalance } from "@/hooks/use-balance";
import type { FetchedPool } from "@/lib/solana/accounts";
import { formatAmount } from "@/lib/format";
import { poolToasts, txErrorToast, dismissToast } from "@/lib/solana/transaction-toast";

const CODE_LENGTH = 8;
// Joining pays rent for the member account (about 0.002 SOL) plus the fee.
const JOIN_COST = 0.005;
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);

// Before a code: six seats, one lit at the pip, waiting for you.
const WAITING_DIAL: DialSpec = { seats: 6, mode: "pending", open: [1, 2, 3, 4, 5], staked: [0], you: 0 };

/** The circle found by the code, with the seat you'd take lit at the next free place. */
function seatPreview(pool: FetchedPool): DialSpec {
  if (pool.status !== "pending" || pool.memberCount >= pool.maxMembers) return dialFromPoolOnly(pool);
  const yours = pool.memberCount;
  return {
    seats: pool.maxMembers,
    mode: "pending",
    open: Array.from({ length: pool.maxMembers }, (_, i) => i).filter((i) => i > yours),
    staked: [yours],
    you: yours,
  };
}

const STEPS = [
  { title: "Take a seat", body: "The host’s code opens one for you." },
  { title: "Stake, if asked", body: "Back at the end if you pay every round." },
  { title: "Pay each round", body: "Each round, one seat takes the whole pot." },
];

export default function JoinPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { getPoolByInviteCode } = useSolanaPoolData();
  const { joinPool, isLoading: joining } = useSolanaPoolActions();
  const balance = useBalance();
  const card = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const linkedOnce = useRef(false);
  const lookupSeq = useRef(0);

  const [code, setCode] = useState("");
  const [pool, setPool] = useState<FetchedPool | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  // Find was tapped before all eight characters were in
  const [incomplete, setIncomplete] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Move focus to the result so screen readers hear it; the Find button unmounts.
  useEffect(() => {
    if (pool) card.current?.focus();
  }, [pool]);

  const lookup = async (value: string) => {
    if (value.length !== CODE_LENGTH) return;
    const seq = ++lookupSeq.current;
    setSearching(true);
    setNotFound(false);
    setLookupFailed(false);
    try {
      const found = await getPoolByInviteCode(value);
      if (seq !== lookupSeq.current) return;
      setPool(found);
      setNotFound(!found);
    } catch (error) {
      // An unreachable network is not the same as a wrong code
      if (seq !== lookupSeq.current) return;
      console.error("Invite lookup failed:", error);
      setLookupFailed(true);
    } finally {
      if (seq === lookupSeq.current) setSearching(false);
    }
  };

  // A shared invite link (/join?code=…) fills the boxes and looks the circle up, once.
  // Read from the URL itself: useSearchParams would need a Suspense boundary on a static page.
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

  // A complete code looks the circle up by itself, like any one-time code: the eighth
  // character, or a whole new code pasted over the last one
  const updateCode = (raw: string) => {
    const next = normalizeCode(raw);
    const completed = next.length === CODE_LENGTH && next !== code;
    setCode(next);
    setPool(null);
    setNotFound(false);
    setLookupFailed(false);
    setIncomplete(false);
    if (completed) void lookup(next);
  };

  const find = () => {
    if (code.length === CODE_LENGTH) return void lookup(code);
    // Never a dead button: say what's missing and put the caret back in the boxes
    setIncomplete(true);
    document.getElementById("join-code")?.focus();
  };

  const paste = async () => {
    try {
      updateCode(await navigator.clipboard.readText());
    } catch {
      // Clipboard permission denied; user can type instead
    }
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
  const dialLabel = pool ? `${pool.name}: ${pool.memberCount} of ${pool.maxMembers} seats taken` : "A seat waiting for you";

  return (
    <AppShell title="Join a circle" back>
      <div className="flex flex-col items-center pt-1 text-center">
        <Dial spec={pool ? seatPreview(pool) : WAITING_DIAL} size={176} view="create" label={dialLabel} />
        <h2 className="bz-title mt-1 max-w-full truncate">{pool ? pool.name : "Enter your invite code"}</h2>
        <p className="bz-body mt-1">
          {pool
            ? pool.status === "pending" && !full
              ? "Your seat is the lit one."
              : "This circle isn’t taking seats."
            : "Eight letters or numbers from the host."}
        </p>
      </div>

      <div className="mt-5">
        <CodeBoxes
          value={code}
          onChange={updateCode}
          onEnter={() => void lookup(code)}
          state={notFound ? "error" : pool ? "found" : "idle"}
          readOnly={searching || joining}
          describedBy="join-code-help"
          id="join-code"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p id="join-code-help" role="status" className={notFound || incomplete ? "bz-help bz-help-signal m-0" : "bz-help m-0"}>
            {searching
              ? "Looking up the circle…"
              : notFound
                ? "No circle with that code."
                : incomplete
                  ? `Enter all ${CODE_LENGTH} letters or numbers.`
                  : "An invite link fills this in."}
          </p>
          <button
            onClick={paste}
            disabled={searching || joining}
            className="bz-hit inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--border)] active:scale-[0.98]"
          >
            <Icon name="paste" className="size-4" />
            Paste
          </button>
        </div>
      </div>

      {lookupFailed && (
        <Note tone="signal" icon="offline" className="mt-4">
          Can&rsquo;t reach Solana. Check your connection.
        </Note>
      )}

      {!pool && (
        <Button
          className="mt-5"
          icon={lookupFailed ? "refresh" : undefined}
          onClick={find}
          busy={searching}
          busyLabel="Looking up…"
        >
          {lookupFailed ? "Try again" : "Find circle"}
        </Button>
      )}

      {pool ? (
        <>
          <div
            ref={card}
            tabIndex={-1}
            role="region"
            aria-label={`Found: ${pool.name}`}
            className="mt-5 rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)] outline-none"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{`${amount} ${currency}`}</span> per round
              </p>
              <StatusPill status={pool.status} label={pool.status === "pending" && full ? "Full" : undefined} />
            </div>
            <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
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
      ) : (
        // What joining means, for anyone who got a code and nothing else
        <section className="mt-8" aria-labelledby="join-how">
          <Label className="block px-0.5">
            <span id="join-how">How joining works</span>
          </Label>
          <ol className="bz-steps mt-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span aria-hidden="true" className="bz-steps-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[15px] font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </AppShell>
  );
}
