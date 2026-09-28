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
