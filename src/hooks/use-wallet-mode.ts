"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useCallback, useMemo } from "react";
import { Transaction, PublicKey } from "@solana/web3.js";

// Self-custodial only: the connected wallet (Seed Vault, Phantom, Solflare via
// Mobile Wallet Adapter / Seeker Connect) signs every transaction.
export type WalletMode = "web3" | "none";

interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerLink?: string;
  error?: string;
}

export function useWalletMode() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);

  const mode: WalletMode = connected && publicKey ? "web3" : "none";

  const walletAddress = useMemo(
    () => (mode === "web3" && publicKey ? publicKey.toBase58() : null),
    [mode, publicKey]
  );

  const walletPublicKey = mode === "web3" ? publicKey : null;

  const sendWalletTransaction = useCallback(
    async (
      transaction: Transaction,
      // Kept for call-site compatibility; used only for logging context
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _action: string
    ): Promise<TransactionResult> => {
      if (!publicKey) {
        return { success: false, error: "Wallet not connected" };
      }

      setIsLoading(true);

      try {
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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Transaction failed";
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [connection, sendTransaction, publicKey]
  );

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
    mode,
    isWeb3: mode === "web3",
    isCustodial: false as const,
    hasWallet: mode !== "none",

    walletAddress,
    walletPublicKey,

    sendTransaction: sendWalletTransaction,
    buildAndSendTransaction,
    isLoading,

    connection,
  };
}
