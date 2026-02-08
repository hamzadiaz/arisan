"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useState, useCallback, useMemo } from "react";
import { Transaction, PublicKey, Connection } from "@solana/web3.js";

export type WalletMode = "web3" | "custodial" | "none";

interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerLink?: string;
  error?: string;
}

export function useWalletMode() {
  const { connection } = useConnection();
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const { user, userProfile, firebaseUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Determine wallet mode
  const mode: WalletMode = useMemo(() => {
    if (connected && publicKey) {
      return "web3";
    }
    if (user && userProfile?.custodialWallet) {
      return "custodial";
    }
    return "none";
  }, [connected, publicKey, user, userProfile?.custodialWallet]);

  // Get the active wallet address
  const walletAddress = useMemo(() => {
    if (mode === "web3" && publicKey) {
      return publicKey.toBase58();
    }
    if (mode === "custodial" && userProfile?.custodialWallet) {
      return userProfile.custodialWallet;
    }
    return null;
  }, [mode, publicKey, userProfile?.custodialWallet]);

  // Get PublicKey object for the active wallet
  const walletPublicKey = useMemo(() => {
    if (!walletAddress) return null;
    try {
      return new PublicKey(walletAddress);
    } catch {
      return null;
    }
  }, [walletAddress]);

  // Sign and send transaction (works for both modes)
  const sendWalletTransaction = useCallback(
    async (
      transaction: Transaction,
      action: string
    ): Promise<TransactionResult> => {
      if (mode === "none") {
        return { success: false, error: "No wallet available" };
      }

      setIsLoading(true);

      try {
        if (mode === "web3") {
          // Web3 mode: User signs directly with their wallet
          if (!signTransaction || !publicKey) {
            return { success: false, error: "Wallet not connected" };
          }

          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = publicKey;

          const signature = await sendTransaction(transaction, connection);

          await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
          });

          const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
          return {
            success: true,
            signature,
            explorerLink: `https://explorer.solana.com/tx/${signature}?cluster=${network}`,
          };
        } else if (mode === "custodial") {
          // Custodial mode: Backend signs on behalf of user
          if (!firebaseUser || !walletPublicKey) {
            return { success: false, error: "Not authenticated" };
          }

          const idToken = await firebaseUser.getIdToken();

          // Set blockhash and fee payer before serializing
          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = walletPublicKey;

          // Serialize transaction for API
          const transactionBase64 = transaction
            .serialize({ requireAllSignatures: false })
            .toString("base64");

          const response = await fetch("/api/custodial/sign-transaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              transactionBase64,
              action,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            return {
              success: false,
              error: result.error || "Transaction failed",
            };
          }

          return {
            success: true,
            signature: result.signature,
            explorerLink: result.explorerLink,
          };
        }

        return { success: false, error: "Unknown wallet mode" };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Transaction failed";
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [mode, connection, signTransaction, sendTransaction, publicKey, walletPublicKey, firebaseUser]
  );

  // Helper to build and send transaction in one call
  const buildAndSendTransaction = useCallback(
    async (
      buildFn: (walletPubkey: PublicKey) => Promise<Transaction>,
      action: string
    ): Promise<TransactionResult> => {
      if (!walletPublicKey) {
        return { success: false, error: "No wallet available" };
      }

      try {
        const transaction = await buildFn(walletPublicKey);
        return sendWalletTransaction(transaction, action);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to build transaction";
        return { success: false, error: message };
      }
    },
    [walletPublicKey, sendWalletTransaction]
  );

  return {
    // Mode info
    mode,
    isWeb3: mode === "web3",
    isCustodial: mode === "custodial",
    hasWallet: mode !== "none",

    // Wallet info
    walletAddress,
    walletPublicKey,

    // Transaction helpers
    sendTransaction: sendWalletTransaction,
    buildAndSendTransaction,
    isLoading,

    // Raw connection for queries
    connection,
  };
}
