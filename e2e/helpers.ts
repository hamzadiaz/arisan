import { createHash } from "node:crypto";
import path from "node:path";
import { BN, BorshAccountsCoder, utils, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect, type Page } from "@playwright/test";
import idl from "../src/lib/solana/idl.json";

export const PROOF_DIR = path.join(__dirname, "..", "docs", "e2e-proof", "ui");
export const RPC_URL = "http://127.0.0.1:8899";

export async function proof(page: Page, name: string) {
  await page.screenshot({ path: path.join(PROOF_DIR, `${name}.png`), fullPage: true });
}

/** Wait until client providers have mounted (the wallet modal context is client-only). */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("nav")).toBeVisible();
}

export const walletSheet = (page: Page) => page.locator(".wallet-adapter-modal");

/** Click until the wallet sheet opens; the first click can land before hydration. */
export async function openWalletSheet(page: Page, trigger: () => Promise<void>) {
  await expect(async () => {
    if (!(await walletSheet(page).isVisible())) await trigger();
    await expect(walletSheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // Playwright treats opacity 0 as visible; wait until the fade-in has finished.
  await expect(walletSheet(page)).toHaveCSS("opacity", "1");
}

export const FORBIDDEN_COPY = /stripe|custodial|\bnfts?\b|credit card|debit card|card payment/i;

export async function expectNoForbiddenCopy(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text, "user-facing text must not mention Stripe, custodial wallets or NFTs").not.toMatch(
    FORBIDDEN_COPY
  );
}

// ---------------------------------------------------------------------------
// Solana JSON-RPC mock. The app is built against a dead local RPC, so reads fail
// closed by default. Tests that need a real-looking pool route the RPC here and
// serve a Borsh-encoded Pool account built from the same IDL the app uses.
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const coder = new BorshAccountsCoder(idl as Idl);
const poolDiscriminator = utils.bytes.bs58.encode(
  Buffer.from((idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
    (a) => a.name === "Pool"
  )!.discriminator)
);

export const MOCK_POOL = {
  address: new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"),
  authority: new PublicKey("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG"),
  inviteCode: "E2ETEST1",
  name: "E2E Family Circle",
  maxMembers: 5,
  lamportsPerRound: 500_000_000,
};

async function encodeMockPool(): Promise<Buffer> {
  const name = Buffer.alloc(32);
  name.write(MOCK_POOL.name);
  const wallets = Array.from({ length: 20 }, () => PublicKey.default);
  wallets[0] = MOCK_POOL.authority;
  // Field keys follow the IDL (snake_case); the app's Program camel-cases on decode.
  return coder.encode("Pool", {
    authority: MOCK_POOL.authority,
    name: [...name],
    max_members: MOCK_POOL.maxMembers,
    member_count: 1,
    contribution_amount: new BN(MOCK_POOL.lamportsPerRound),
    currency: { Sol: {} },
    total_rounds: MOCK_POOL.maxMembers,
    current_round: 0,
    status: { Pending: {} },
    next_draw_timestamp: new BN(0),
    invite_code_hash: [...createHash("sha256").update(MOCK_POOL.inviteCode).digest()],
    stake_multiplier: 1,
    bump: 255,
    vault_bump: 255,
    token_vault: PublicKey.default,
    created_at: new BN(1_750_000_000),
    pool_index: new BN(0),
    stake_enabled: true,
    grace_period_seconds: new BN(172_800),
    auto_mode: false,
    member_wallets: wallets,
    roster_len: 1,
    randomness_slot: new BN(0),
    randomness_round: 0,
  });
}

export async function mockRpcWithPool(page: Page) {
  const data = await encodeMockPool();
  const account = {
    data: [data.toString("base64"), "base64"],
    executable: false,
    lamports: 10_000_000,
    owner: PROGRAM_ID.toBase58(),
    rentEpoch: 0,
    space: data.length,
  };
  const context = { slot: 1, apiVersion: "1.18.26" };

  const answer = (method: string, params: unknown[]) => {
    switch (method) {
      case "getAccountInfo":
        return { context, value: params[0] === MOCK_POOL.address.toBase58() ? account : null };
      case "getBalance":
        return { context, value: 0 };
      case "getProgramAccounts": {
        const filters = ((params[1] as { filters?: unknown[] })?.filters ?? []) as {
          memcmp?: { offset: number; bytes: string };
        }[];
        const wantsPools = filters.some(
          (f) => f.memcmp?.offset === 0 && f.memcmp.bytes === poolDiscriminator
        );
        return wantsPools ? [{ pubkey: MOCK_POOL.address.toBase58(), account }] : [];
      }
      case "getLatestBlockhash":
        return { context, value: { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 1 } };
      default:
        return null;
    }
  };

  await page.route((url) => url.origin === RPC_URL, async (route) => {
    const body = route.request().postDataJSON();
    const reply = (req: { id: unknown; method: string; params?: unknown[] }) => ({
      jsonrpc: "2.0",
      id: req.id,
      result: answer(req.method, req.params ?? []),
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)),
    });
  });
}

// ---------------------------------------------------------------------------
// Mock Wallet Standard wallet. It registers the same way Phantom or MWA do, so the
// app's own wallet-adapter stack discovers it, lists it in the sheet and connects.
// It refuses to sign: these tests cover identity, not transactions.
// ---------------------------------------------------------------------------

export const MOCK_WALLET = {
  name: "E2E Wallet",
  address: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
};
export const MOCK_WALLET_SHORT = `${MOCK_WALLET.address.slice(0, 4)}…${MOCK_WALLET.address.slice(-4)}`;

export async function installMockWallet(page: Page) {
  const publicKey = [...new PublicKey(MOCK_WALLET.address).toBytes()];
  await page.addInitScript(
    ({ name, address, publicKey }) => {
      const chains = ["solana:devnet", "solana:testnet", "solana:mainnet", "solana:localnet"];
      const account = {
        address,
        publicKey: new Uint8Array(publicKey),
        chains,
        features: ["solana:signTransaction"],
      };
      let accounts: (typeof account)[] = [];
      const listeners: Record<string, ((props: unknown) => void)[]> = {};
      const emit = () => (listeners.change ?? []).forEach((l) => l({ accounts }));
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
            signTransaction: async () => {
              throw new Error("E2E wallet does not sign");
            },
          },
        },
      };
      const register = ({ register }: { register: (w: unknown) => void }) => register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) =>
        register((e as CustomEvent).detail)
      );
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
    },
    { name: MOCK_WALLET.name, address: MOCK_WALLET.address, publicKey }
  );
}

/** Connect the mock wallet through the real header chip and wallet sheet. */
export async function connectMockWallet(page: Page) {
  await openWalletSheet(page, () =>
    page.locator("header").getByRole("button", { name: "Connect", exact: true }).click()
  );
  await walletSheet(page).getByRole("button", { name: new RegExp(MOCK_WALLET.name) }).click();
  await expect(page.locator("header").getByText(MOCK_WALLET_SHORT)).toBeVisible();
}
