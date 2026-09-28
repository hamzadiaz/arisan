"use client";

import { useEffect } from "react";
import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-standard-mobile";
import { registerSeekerConnect } from "@solana-mobile/seeker-connect-wallet-standard";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const CHAIN = `solana:${NETWORK === "mainnet-beta" ? "mainnet" : NETWORK}` as const;

// Seeker Connect needs a Nostr relay. Solana Mobile's relay is free but gated
// behind their terms, so it is only enabled when the domain is configured.
const SEEKER_RELAY_DOMAIN = process.env.NEXT_PUBLIC_SEEKER_RELAY_DOMAIN;

let registered = false;

// Registers Mobile Wallet Adapter (Android Chrome / WebView -> Seed Vault,
// Phantom, Solflare) and Seeker Connect with the Wallet Standard registry.
// The wallet-adapter provider picks both up like any other standard wallet.
export function MobileWalletRegistration() {
  useEffect(() => {
    if (registered) return;
    registered = true;

    const identity = {
      name: "Arisan",
      uri: window.location.origin,
      icon: "/arisan-icon.png",
    };

    registerMwa({
      appIdentity: identity,
      authorizationCache: createDefaultAuthorizationCache(),
      chains: [CHAIN],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });

    if (SEEKER_RELAY_DOMAIN) {
      registerSeekerConnect({
        identity,
        relayDomain: SEEKER_RELAY_DOMAIN,
        chain: CHAIN,
      });
    }
  }, []);

  return null;
}
