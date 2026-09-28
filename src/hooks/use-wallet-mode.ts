"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
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
  const [isLoading, setIsLoading] = useState(false);

  // CLOCK IN is self-custodial. A server-held key is never the active signer.
  const mode: WalletMode = useMemo(() => {
    if (connected && publicKey) {
      return "web3";
    }
    return "none";
  }, [connected, publicKey]);

  // Get the active wallet address
  const walletAddress = useMemo(() => {
    if (mode === "web3" && publicKey) {
      return publicKey.toBase58();
    }
    return null;
  }, [mode, publicKey]);

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
      _action: string
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
        }

        return { success: false, error: "Connect a self-custodial wallet to sign" };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Transaction failed";
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [mode, connection, signTransaction, sendTransaction, publicKey]
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
