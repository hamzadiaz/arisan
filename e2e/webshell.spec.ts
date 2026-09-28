import { test, expect } from "@playwright/test";
import { gotoReady, openWalletSheet, walletSheet } from "./helpers";

// The Android APK is this app inside the Solana Mobile web shell (android/). Its WebView
// user agent carries the "; wv)" WebView marker plus "Solana Mobile Web Shell".
const WEBSHELL_UA =
  "Mozilla/5.0 (Linux; Android 16; sdk_gphone64_arm64 Build/BE4B.251210.005; wv) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/145.0.7632.79 Mobile Safari/537.36 " +
  "Solana Mobile Web Shell";

test.use({ userAgent: WEBSHELL_UA });

test("the web shell lists Mobile Wallet Adapter in the wallet sheet (E2E-15, E2E-16)", async ({
  page,
}) => {
  await gotoReady(page, "/");
  await openWalletSheet(page, () => page.getByRole("button", { name: "Connect wallet" }).click());
  // Empty sheet before: wallet-standard-mobile 0.4.4 refused WebViews (E2E-15), and the
  // registration ran after the provider's snapshot and before its subscription (E2E-16).
  await expect(walletSheet(page)).not.toContainText("You'll need a wallet");
  await expect(walletSheet(page).getByRole("button", { name: /Mobile Wallet Adapter/ })).toBeVisible();
});
