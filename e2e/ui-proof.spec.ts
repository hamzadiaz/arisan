import path from "node:path";
import { BN, BorshAccountsCoder, utils, type Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { test, expect, type Page } from "@playwright/test";
import idl from "../src/lib/solana/idl.json";
import {
  MOCK_POOL,
  MOCK_WALLET,
  RPC_URL,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  walletSheet,
} from "./helpers";

// Screenshot capture for docs/ui-proof. Skipped in the normal gate; run with
//   UI_PROOF=1 npx playwright test e2e/ui-proof.spec.ts
// Connected screens use the watch-only mock wallet from helpers and a mocked RPC
// serving Borsh-encoded Pool / Member / Payment / Draw accounts.

test.skip(!process.env.UI_PROOF, "set UI_PROOF=1 to capture docs/ui-proof screenshots");

const OUT = path.join(__dirname, "..", "docs", "ui-proof");
const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const coder = new BorshAccountsCoder(idl as Idl);
const disc = (name: string) =>
  utils.bytes.bs58.encode(
    Buffer.from(
      (idl as { accounts: { name: string; discriminator: number[] }[] }).accounts.find(
        (a) => a.name === name
      )!.discriminator
    )
  );

const ME = new PublicKey(MOCK_WALLET.address);
const OTHERS = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
const NOW = Math.floor(Date.now() / 1000);
const SOL = 1_000_000_000;

type Acc = { pubkey: PublicKey; kind: string; data: Buffer; pool?: string; wallet?: string };

async function buildAccounts(): Promise<Acc[]> {
  const out: Acc[] = [];
  const pool = async (
    name: string,
    status: string,
    round: number,
    lamports: number,
    roster: PublicKey[],
    authority: PublicKey
  ) => {
    const key = Keypair.generate().publicKey;
    const nameBuf = Buffer.alloc(32);
    nameBuf.write(name);
    const wallets = Array.from({ length: 20 }, (_, i) => roster[i] ?? PublicKey.default);
    const data = await coder.encode("Pool", {
      authority,
      name: [...nameBuf],
      max_members: 5,
      member_count: roster.length,
      contribution_amount: new BN(lamports),
      currency: { Sol: {} },
      total_rounds: 5,
      current_round: round,
      status: { [status]: {} },
      next_draw_timestamp: new BN(status === "Active" ? NOW + 2 * 86400 + 5 * 3600 : 0),
      invite_code_hash: Array(32).fill(0),
      stake_multiplier: 1,
      bump: 255,
      vault_bump: 255,
      token_vault: PublicKey.default,
      created_at: new BN(NOW - out.length * 1000),
      pool_index: new BN(0),
      stake_enabled: true,
      grace_period_seconds: new BN(172_800),
      auto_mode: false,
      member_wallets: wallets,
      roster_len: roster.length,
      randomness_slot: new BN(0),
      randomness_round: 0,
    });
    out.push({ pubkey: key, kind: "Pool", data });
    for (const [i, w] of roster.entries()) {
      const won = status !== "Pending" && i > 0 && i < round ? i : 0;
      out.push({
        pubkey: Keypair.generate().publicKey,
        kind: "Member",
        pool: key.toBase58(),
        wallet: w.toBase58(),
        data: await coder.encode("Member", {
          pool: key,
          wallet: w,
          has_won: won > 0,
          won_round: won,
          stake_deposited: status !== "Pending" || i < 2,
          stake_amount: new BN(lamports),
          payments_made: 0,
          joined_at: new BN(NOW - 86400 * 10),
          position: i,
          bump: 255,
          in_default: false,
          in_grace_period: false,
          grace_deadline: new BN(0),
          is_kicked: false,
          missed_rounds: 0,
        }),
      });
    }
    return key;
  };

  const family = await pool("Family circle", "Active", 3, 0.5 * SOL, [ME, ...OTHERS], OTHERS[0]);
  await pool("Office lunch", "Pending", 0, 0.2 * SOL, [ME, OTHERS[1], OTHERS[2]], ME);
  await pool("Flat deposit", "Completed", 5, 1 * SOL, [ME, ...OTHERS], OTHERS[3]);

  // Family circle: two draws so far, three of five paid this round
  for (const [round, winner] of [
    [1, OTHERS[0]],
    [2, OTHERS[1]],
  ] as const) {
    out.push({
      pubkey: Keypair.generate().publicKey,
      kind: "Draw",
      pool: family.toBase58(),
      data: await coder.encode("Draw", {
        pool: family,
        round,
        winner,
        amount: new BN(2.5 * SOL),
        vrf_result: Array(32).fill(7),
        drawn_at: new BN(NOW - (3 - round) * 7 * 86400),
        claimed: true,
        bump: 255,
      }),
    });
  }
  for (const w of OTHERS.slice(0, 3)) {
    out.push({
      pubkey: Keypair.generate().publicKey,
      kind: "Payment",
      pool: family.toBase58(),
      data: await coder.encode("Payment", {
        pool: family,
        member: w,
        round: 3,
        amount: new BN(0.5 * SOL),
        paid_at: new BN(NOW - 3600),
        bump: 255,
      }),
    });
  }
  return out;
}

async function mockRpc(page: Page, accounts: Acc[]) {
  const info = (a: Acc) => ({
    data: [a.data.toString("base64"), "base64"],
    executable: false,
    lamports: 10_000_000,
    owner: PROGRAM_ID.toBase58(),
    rentEpoch: 0,
    space: a.data.length,
  });
  const byKey = new Map(accounts.map((a) => [a.pubkey.toBase58(), a]));
  const discs = Object.fromEntries(["Pool", "Member", "Payment", "Draw"].map((k) => [disc(k), k]));
  const context = { slot: 1, apiVersion: "1.18.26" };

  const answer = (method: string, params: unknown[]) => {
    switch (method) {
      case "getAccountInfo": {
        const a = byKey.get(params[0] as string);
        return { context, value: a ? info(a) : null };
      }
      case "getMultipleAccounts":
        return {
          context,
          value: (params[0] as string[]).map((k) => (byKey.get(k) ? info(byKey.get(k)!) : null)),
        };
      case "getBalance":
        return { context, value: 0 };
      case "getProgramAccounts": {
        const filters = ((params[1] as { filters?: unknown[] })?.filters ?? []) as {
          memcmp?: { offset: number; bytes: string };
        }[];
        let kind: string | undefined;
        let poolFilter: string | undefined;
        let walletFilter: string | undefined;
        for (const f of filters) {
          if (!f.memcmp) continue;
          if (f.memcmp.offset === 0) kind = discs[f.memcmp.bytes];
          else if (f.memcmp.offset === 8) poolFilter = f.memcmp.bytes;
          else if (f.memcmp.offset === 40) walletFilter = f.memcmp.bytes;
        }
        return accounts
          .filter(
            (a) =>
              a.kind === kind &&
              (!poolFilter || a.pool === poolFilter) &&
              (!walletFilter || a.wallet === walletFilter)
          )
          .map((a) => ({ pubkey: a.pubkey.toBase58(), account: info(a) }));
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

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
}

const shot = (page: Page, theme: string, name: string) =>
  page.screenshot({ path: path.join(OUT, `${theme}-${name}.png`) });

for (const theme of ["dark", "light"] as const) {
  test.describe(`ui-proof ${theme} walkthrough`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("first-visit walkthrough", async ({ page }) => {
      await setTheme(page, theme);
      await page.goto("/");
      const walkthrough = page.getByTestId("walkthrough");
      for (const [i, title] of ["Form a circle", "Everyone pays in", "One takes the pot", "Your keys"].entries()) {
        await expect(walkthrough.getByRole("heading", { name: title })).toBeVisible();
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(400);
        await shot(page, theme, `00-walkthrough-${i + 1}`);
        await walkthrough.getByRole("button", { name: i === 3 ? "Get started" : "Next" }).click();
      }
      await expect(walkthrough).toBeHidden();
    });
  });

  test.describe(`ui-proof ${theme}`, () => {
    test("disconnected screens", async ({ page }) => {
      await setTheme(page, theme);
      await gotoReady(page, "/");
      await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
      await shot(page, theme, "01-welcome");

      await gotoReady(page, "/pools/create");
      await page.getByPlaceholder("Family circle").fill("Family circle");
      await page.getByPlaceholder("0.5").fill("0.5");
      await shot(page, theme, "04-create");

      await mockRpcWithPool(page);
      await gotoReady(page, "/join");
      await page.getByPlaceholder("ABCD1234").fill(MOCK_POOL.inviteCode);
      await page.getByRole("button", { name: "Find pool" }).click();
      await expect(page.getByText(MOCK_POOL.name)).toBeVisible();
      await shot(page, theme, "05-join");
    });

    test("connected screens", async ({ page }) => {
      const accounts = await buildAccounts();
      await setTheme(page, theme);
      await mockRpc(page, accounts);
      await installMockWallet(page);

      await gotoReady(page, "/");
      await connectMockWallet(page);
      await expect(page.getByText("Family circle").first()).toBeVisible({ timeout: 15_000 });
      await expect(walletSheet(page)).toHaveCount(0);
      await shot(page, theme, "02-home");

      const family = accounts.find((a) => a.kind === "Pool")!.pubkey.toBase58();
      await gotoReady(page, `/pools/${family}`);
      await expect(page.getByRole("button", { name: /^Pay / })).toBeVisible({ timeout: 15_000 });
      await shot(page, theme, "03-pool");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, theme, "03b-pool-members");
    });
  });
}
