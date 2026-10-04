"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/** The connected wallet's SOL balance, or null while unknown (not connected, or the read failed). */
export function useBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    connection.getBalance(publicKey, "confirmed").then(
      (lamports) => !cancelled && setSol(lamports / LAMPORTS_PER_SOL),
      () => !cancelled && setSol(null)
    );
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { sol: publicKey ? sol : null, refresh };
}
