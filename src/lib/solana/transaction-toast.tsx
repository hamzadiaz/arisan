"use client";

import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { TransactionResult, getExplorerLink } from "./instructions";

// Network for explorer links
const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") || "devnet";

interface ToastOptions {
  title?: string;
  description?: string;
}

// Transaction toast with loading state
export function transactionToast(
  promise: Promise<TransactionResult>,
  options: {
    loading?: ToastOptions;
    success?: ToastOptions;
    error?: ToastOptions;
  } = {}
): Promise<TransactionResult> {
  const {
    loading = { title: "Processing Transaction", description: "Please approve in your wallet..." },
    success = { title: "Transaction Successful" },
    error = { title: "Transaction Failed" },
  } = options;

  return new Promise((resolve) => {
    const toastId = toast.loading(
      <div>
        <p className="font-medium">{loading.title}</p>
        {loading.description && (
          <p className="text-sm text-muted-foreground">{loading.description}</p>
        )}
      </div>
    );

    promise.then((result) => {
      if (result.success) {
        toast.success(
          <div>
            <p className="font-medium">{success.title}</p>
            {success.description && (
              <p className="text-sm text-muted-foreground">{success.description}</p>
            )}
            {result.signature && (
              <a
                href={getExplorerLink(result.signature, NETWORK)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
              >
                View on Explorer
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>,
          { id: toastId, duration: 5000 }
        );
      } else {
        toast.error(
          <div>
            <p className="font-medium">{error.title}</p>
            <p className="text-sm text-muted-foreground">
              {result.error || error.description || "Something went wrong"}
            </p>
          </div>,
          { id: toastId, duration: 5000 }
        );
      }
      resolve(result);
    });
  });
}

// Simple success toast with explorer link
export function txSuccessToast(
  signature: string,
  title: string = "Transaction Successful",
  description?: string
) {
  toast.success(
    <div>
      <p className="font-medium">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <a
        href={getExplorerLink(signature, NETWORK)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
      >
        View on Explorer
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>,
    { duration: 5000 }
  );
}

// Error toast
export function txErrorToast(
  errorMessage: string,
  title: string = "Transaction Failed"
) {
  toast.error(
    <div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{errorMessage}</p>
    </div>,
    { duration: 5000 }
  );
}

// Warning toast
export function txWarningToast(
  message: string,
  title: string = "Warning"
) {
  toast.warning(
    <div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>,
    { duration: 4000 }
  );
}

// Info toast for wallet connection
export function walletRequiredToast() {
  toast.warning(
    <div>
      <p className="font-medium">Wallet Required</p>
      <p className="text-sm text-muted-foreground">
        Please connect your wallet to continue
      </p>
    </div>,
    { duration: 3000 }
  );
}

// Pool creation specific toasts
export const poolToasts = {
  creating: () =>
    toast.loading(
      <div>
        <p className="font-medium">Creating Pool</p>
        <p className="text-sm text-muted-foreground">Deploying on-chain...</p>
      </div>
    ),

  created: (signature: string, inviteCode?: string) =>
    toast.success(
      <div>
        <p className="font-medium">Pool Created!</p>
        {inviteCode && (
          <p className="text-sm text-muted-foreground">
            Invite code: <span className="font-mono">{inviteCode}</span>
          </p>
        )}
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 6000 }
    ),

  joining: () =>
    toast.loading(
      <div>
        <p className="font-medium">Joining Pool</p>
        <p className="text-sm text-muted-foreground">Please approve in your wallet...</p>
      </div>
    ),

  joined: (signature: string) =>
    toast.success(
      <div>
        <p className="font-medium">Joined Pool!</p>
        <p className="text-sm text-muted-foreground">
          You are now a member of this pool
        </p>
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 5000 }
    ),

  depositingStake: () =>
    toast.loading(
      <div>
        <p className="font-medium">Depositing Stake</p>
        <p className="text-sm text-muted-foreground">Locking collateral in vault...</p>
      </div>
    ),

  stakeDeposited: (signature: string, amount: number, currency: string) =>
    toast.success(
      <div>
        <p className="font-medium">Stake Deposited!</p>
        <p className="text-sm text-muted-foreground">
          {amount} {currency} locked as collateral
        </p>
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 5000 }
    ),

  makingPayment: () =>
    toast.loading(
      <div>
        <p className="font-medium">Processing Payment</p>
        <p className="text-sm text-muted-foreground">Contributing to pool...</p>
      </div>
    ),

  paymentMade: (signature: string, amount: number, currency: string, round: number) =>
    toast.success(
      <div>
        <p className="font-medium">Payment Successful!</p>
        <p className="text-sm text-muted-foreground">
          {amount} {currency} contributed for Round {round}
        </p>
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 5000 }
    ),

  startingPool: () =>
    toast.loading(
      <div>
        <p className="font-medium">Starting Pool</p>
        <p className="text-sm text-muted-foreground">Activating the pool...</p>
      </div>
    ),

  poolStarted: (signature: string) =>
    toast.success(
      <div>
        <p className="font-medium">Pool Started!</p>
        <p className="text-sm text-muted-foreground">
          The pool is now active
        </p>
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 5000 }
    ),

  claimingWinnings: () =>
    toast.loading(
      <div>
        <p className="font-medium">Claiming Winnings</p>
        <p className="text-sm text-muted-foreground">Transferring pot to your wallet...</p>
      </div>
    ),

  winningsClaimed: (signature: string, amount: number, currency: string) =>
    toast.success(
      <div>
        <p className="font-medium">Winnings Claimed!</p>
        <p className="text-sm text-muted-foreground">
          {amount} {currency} sent to your wallet
        </p>
        <a
          href={getExplorerLink(signature, NETWORK)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 mt-2"
        >
          View on Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>,
      { duration: 6000 }
    ),

  // Specific error toasts for better UX
  invalidInviteCode: () =>
    toast.error(
      <div>
        <p className="font-medium">Invalid Invite Code</p>
        <p className="text-sm text-muted-foreground">
          The invite code you entered is incorrect. Please check and try again.
        </p>
      </div>,
      { duration: 5000 }
    ),

  joinFailed: (errorMessage: string) =>
    toast.error(
      <div>
        <p className="font-medium">Failed to Join Pool</p>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      </div>,
      { duration: 5000 }
    ),
};

// Dismiss a specific toast
export function dismissToast(toastId: string | number) {
  toast.dismiss(toastId);
}
