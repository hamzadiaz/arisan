"use client";

import { useMemo, ReactNode, useCallback, useEffect, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletError } from "@solana/wallet-adapter-base";
import { clusterApiUrl, type ConnectionConfig } from "@solana/web3.js";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

// ConnectionProvider's default config is a new object per render, which builds a new
// Connection (and refetches every reader) whenever this provider re-renders.
const CONNECTION_CONFIG: ConnectionConfig = { commitment: "confirmed" };

interface SolanaProviderProps {
  children: ReactNode;
}

export function SolanaProvider({ children }: SolanaProviderProps) {
  // Auto-connect only after mount; the provider tree itself must never change shape,
  // or React remounts every page (state lost, effects and RPC reads run twice) and
  // header taps before mount hit the no-op default wallet-modal context.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get the network from environment variable
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta" | "testnet") || "devnet";

  // Use custom RPC URL if provided, otherwise use default cluster URL
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network);
  }, [network]);

  // Use empty array - Wallet Standard auto-detects installed wallets like Phantom, Solflare, etc.
  const wallets = useMemo(() => [], []);

  // Error handler
  const onError = useCallback((error: WalletError) => {
    console.error("Wallet error:", error.name, error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={CONNECTION_CONFIG}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={mounted}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
