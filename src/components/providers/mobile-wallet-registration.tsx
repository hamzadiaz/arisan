"use client";

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

// Registers Mobile Wallet Adapter (Android Chrome and the Solana Mobile web shell ->
// Seed Vault, Phantom, Solflare) and Seeker Connect with the Wallet Standard registry.
//
// This runs when the module is evaluated, before React renders. The wallet-adapter
// provider reads the registry once on its first render and only subscribes to later
// registrations in an effect; registering from this component's own effect (which fires
// before the provider's) was missed, leaving the wallet sheet empty in the web shell.
function registerMobileWallets() {
  if (registered || typeof window === "undefined") return;
  registered = true;

  const identity = {
    name: "Arisan",
    uri: window.location.origin,
    icon: "/icons/icon-192.png",
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
}

registerMobileWallets();

/** Rendered once in the root layout so this module (and its registration) always loads. */
export function MobileWalletRegistration() {
  return null;
}
