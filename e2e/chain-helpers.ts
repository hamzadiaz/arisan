import { expect, type Browser, type Page } from "@playwright/test";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { openWalletSheet, walletSheet } from "./helpers";

// Wallets that really sign, for the opt-in chain specs (chain.spec.ts, chain-twenty.spec.ts).

/** A Wallet Standard wallet whose signatures come from a Keypair held by the test runner. */
export async function installSigningWallet(page: Page, keypair: Keypair, name: string) {
  const fn = `__chainSign_${name.replace(/\W/g, "")}`;
  await page.exposeFunction(fn, (bytes: number[]) => {
    const raw = Buffer.from(bytes);
    // A v0 message starts with its version byte (high bit set) right after the signatures
    if (raw[1 + raw[0] * 64] & 0x80) {
      const tx = VersionedTransaction.deserialize(raw);
      tx.sign([keypair]);
      return [...tx.serialize()];
    }
    const tx = Transaction.from(raw);
    tx.partialSign(keypair);
    return [...tx.serialize({ requireAllSignatures: false })];
  });
  await page.addInitScript(
    ({ name, address, publicKey, fn }) => {
      localStorage.setItem("arisan.walkthrough.v1", "done");
      const chains = ["solana:devnet", "solana:localnet"];
      const account = { address, publicKey: new Uint8Array(publicKey), chains, features: ["solana:signTransaction"] };
      let accounts: (typeof account)[] = [];
      const listeners: Record<string, ((props: unknown) => void)[]> = {};
      const emit = () => (listeners.change ?? []).forEach((l) => l({ accounts }));
      const sign = (window as unknown as Record<string, (b: number[]) => Promise<number[]>>)[fn];
      const wallet = {
        version: "1.0.0",
        name,
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        chains,
        get accounts() {
          return accounts;
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              accounts = [account];
              emit();
              return { accounts };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              accounts = [];
              emit();
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (event: string, listener: (props: unknown) => void) => {
              (listeners[event] ??= []).push(listener);
              return () => {
                listeners[event] = listeners[event].filter((l) => l !== listener);
              };
            },
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async (...inputs: { transaction: Uint8Array }[]) =>
              Promise.all(
                inputs.map(async (i) => ({ signedTransaction: new Uint8Array(await sign([...i.transaction])) }))
              ),
          },
        },
      };
      const register = ({ register }: { register: (w: unknown) => void }) => register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) => register((e as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
    },
    { name, address: keypair.publicKey.toBase58(), publicKey: [...keypair.publicKey.toBytes()], fn }
  );
}

export async function memberPage(browser: Browser, baseURL: string | undefined, keypair: Keypair, name: string) {
  // Contexts made here don't inherit the project's `use` options
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await installSigningWallet(page, keypair, name);
  return page;
}

export async function connect(page: Page, name: string) {
  await openWalletSheet(page, () => page.locator("header").getByRole("button", { name: "Connect", exact: true }).click());
  await walletSheet(page).getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.locator(".wallet-adapter-modal")).toHaveCount(0);
}

export const main = (page: Page) => page.locator("main");
export const tap = async (page: Page, name: string | RegExp, timeout = 30_000) => {
  const button = main(page).getByRole("button", { name });
  await expect(button).toBeEnabled({ timeout });
  await button.click();
};

/** Once the draw opens (after the deadline), start it and finish it: two approvals. */
export async function drawRound(page: Page, round: number, waitMs: number) {
  await expect(async () => {
    await page.reload();
    await expect(main(page).getByRole("button", { name: "Draw now" })).toBeEnabled({ timeout: 5_000 });
  }).toPass({ timeout: waitMs, intervals: [15_000] });
  await tap(page, "Draw now");
  await expect(page.getByText("Draw started")).toBeVisible({ timeout: 60_000 });
  await tap(page, "Finish the draw", 60_000);
  await expect(page.getByText(`Round ${round} drawn`)).toBeVisible({ timeout: 90_000 });
}
