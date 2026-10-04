"use client";

import { toast } from "sonner";
import { Icon } from "@/components/bezel/icons";
import { shortAddress } from "@/lib/format";
import { TransactionResult, getExplorerLink } from "./instructions";

// Network for explorer links
const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") || "devnet";

// One body for every transaction toast: a short title, one quiet line, and the explorer link.
function TxBody({ title, line, signature, mono = true }: { title: string; line?: string; signature?: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <p className="text-[13.5px] font-semibold leading-snug">{title}</p>
      {line && <p className={mono ? "font-mono text-[11.5px] text-muted-foreground" : "text-[12.5px] leading-snug text-muted-foreground"}>{line}</p>}
      {signature && (
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-gold-hi"
        >
          View on Explorer
          <span className="font-mono font-normal text-muted-foreground">{shortAddress(signature)}</span>
          <Icon name="external" className="size-3.5" />
        </a>
      )}
    </div>
  );
}

const confirming = (action: string) => toast.loading(<TxBody title="Confirm in your wallet" line={action} />);
const done = (title: string, signature: string, line?: string, duration = 5000) =>
  toast.success(<TxBody title={title} line={line} signature={signature} />, { duration });

// Transaction toast with loading state
export function transactionToast(
  promise: Promise<TransactionResult>,
  options: {
    loading?: { title?: string; description?: string };
    success?: { title?: string; description?: string };
    error?: { title?: string; description?: string };
  } = {}
): Promise<TransactionResult> {
  const loading = options.loading ?? { title: "Confirm in your wallet" };
  const success = options.success ?? { title: "Confirmed" };
  const error = options.error ?? { title: "Transaction failed" };
  return new Promise((resolve) => {
    const toastId = toast.loading(<TxBody title={loading.title ?? "Confirm in your wallet"} line={loading.description} />);
    promise.then((result) => {
      if (result.success) {
        toast.success(<TxBody title={success.title ?? "Confirmed"} line={success.description} signature={result.signature} />, { id: toastId, duration: 5000 });
      } else {
        toast.error(<TxBody title={error.title ?? "Transaction failed"} line={result.error || error.description || "Something went wrong"} mono={false} />, {
          id: toastId,
          duration: 5000,
        });
      }
      resolve(result);
    });
  });
}

// Simple success toast with explorer link
export function txSuccessToast(signature: string, title: string = "Confirmed", description?: string) {
  done(title, signature, description);
}

// Error toast. The title stays "Transaction failed": the wallet or program message follows it.
export function txErrorToast(errorMessage: string, title: string = "Transaction failed") {
  toast.error(<TxBody title={title} line={errorMessage} mono={false} />, { duration: 5000 });
}

// Warning toast
export function txWarningToast(message: string, title: string = "Heads up") {
  toast.warning(<TxBody title={title} line={message} mono={false} />, { duration: 4000 });
}

// Info toast for wallet connection
export function walletRequiredToast() {
  toast.warning(<TxBody title="Connect a wallet first" mono={false} />, { duration: 4000 });
}

export const poolToasts = {
  creating: () => confirming("Create circle"),
  created: (signature: string) => done("Circle created", signature, undefined, 6000),

  joining: () => confirming("Join circle"),
  joined: (signature: string) => done("You joined the circle", signature),

  depositingStake: () => confirming("Deposit stake"),
  stakeDeposited: (signature: string, amount: number, currency: string) =>
    done("Stake deposited", signature, `${amount} ${currency}, back at the end`),

  makingPayment: () => confirming("Pay this round"),
  paymentMade: (signature: string, amount: number, currency: string, round: number) =>
    done("Payment confirmed", signature, `${amount} ${currency} · round ${round}`),

  startingPool: () => confirming("Start circle"),
  poolStarted: (signature: string) => done("Circle started", signature, "Round 1 is open"),

  drawing: () => confirming("Run the draw · approve twice"),
  finishing: () => confirming("Finish the draw"),
  drawn: (signature: string, round: number) => done(`Round ${round} drawn`, signature, undefined, 6000),

  marking: () => confirming("Mark missed payments"),
  marked: (signature: string, count: number) =>
    done(count === 1 ? "Missed payment marked" : `${count} missed payments marked`, signature),

  leaving: () => confirming("Leave circle"),
  left: (signature: string) => done("You left the circle", signature, "Your stake is back in your wallet"),

  rejoining: () => confirming("Rejoin circle"),
  rejoined: (signature: string) => done("You’re back in", signature),

  returningStakes: () => confirming("Return stakes"),
  stakesReturned: (signature: string, count: number) =>
    done(count === 1 ? "Stake returned" : `${count} stakes returned`, signature, undefined, 6000),

  claimingWinnings: () => confirming("Claim the pot"),
  winningsClaimed: (signature: string, amount: number, currency: string) =>
    done("Pot claimed", signature, `${amount} ${currency} to your wallet`, 6000),

  refunding: () => confirming("Get your stake back"),
  refunded: (signature: string, amount: number, currency: string) =>
    done("Stake returned", signature, `${amount} ${currency} to your wallet`, 6000),

  invalidInviteCode: () => toast.error(<TxBody title="Wrong invite code" line="Check the 8 characters and try again." mono={false} />, { duration: 5000 }),
  joinFailed: (errorMessage: string) => toast.error(<TxBody title="Couldn’t join" line={errorMessage} mono={false} />, { duration: 5000 }),
};

// Dismiss a specific toast
export function dismissToast(toastId: string | number) {
  toast.dismiss(toastId);
}
