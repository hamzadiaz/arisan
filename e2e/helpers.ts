import { createHash } from "node:crypto";
import path from "node:path";
import { BN, BorshAccountsCoder, BorshInstructionCoder, utils, type Idl } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
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

export const MOCK_POOL = {
  address: new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"),
  authority: new PublicKey("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG"),
  inviteCode: "E2ETEST1",
  name: "E2E Family Circle",
  maxMembers: 5,
  lamportsPerRound: 500_000_000,
};

export interface MockMember {
  wallet: PublicKey;
  stakeDeposited?: boolean;
  inGracePeriod?: boolean;
  isKicked?: boolean;
}

export interface MockScenario {
  authority?: PublicKey;
  status?: "Pending" | "Active";
  currentRound?: number;
  members?: MockMember[];
  /** Wallets that have paid the current round */
  paid?: PublicKey[];
}

const pda = (seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

async function encodeMockPool(scenario: MockScenario): Promise<Buffer> {
  const name = Buffer.alloc(32);
  name.write(MOCK_POOL.name);
  const members = scenario.members ?? [];
  const wallets = Array.from({ length: 20 }, (_, i) => members[i]?.wallet ?? PublicKey.default);
  const active = scenario.status === "Active";
  // Field keys follow the IDL (snake_case); the app's Program camel-cases on decode.
  return coder.encode("Pool", {
    authority: scenario.authority ?? MOCK_POOL.authority,
    name: [...name],
    max_members: MOCK_POOL.maxMembers,
    member_count: members.length,
    contribution_amount: new BN(MOCK_POOL.lamportsPerRound),
    currency: { Sol: {} },
    total_rounds: MOCK_POOL.maxMembers,
    current_round: active ? (scenario.currentRound ?? 1) : 0,
    status: { [scenario.status ?? "Pending"]: {} },
    next_draw_timestamp: new BN(active ? Math.floor(Date.now() / 1000) + 3 * 86_400 : 0),
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
    roster_len: members.length,
    randomness_slot: new BN(0),
    randomness_round: 0,
  });
}

/**
 * Route the app's RPC to an in-page fake chain holding one pool (plus its members and
 * payments). Accounts are Borsh-encoded from the app's IDL and live at their real PDAs;
 * getProgramAccounts applies memcmp filters the way an RPC node does.
 */
export async function mockRpcWithPool(page: Page, scenario: MockScenario = {}) {
  const accounts = new Map<string, Buffer>();
  accounts.set(MOCK_POOL.address.toBase58(), await encodeMockPool(scenario));
  const round = scenario.status === "Active" ? (scenario.currentRound ?? 1) : 0;
  for (const [i, m] of (scenario.members ?? []).entries()) {
    const address = pda([Buffer.from("member"), MOCK_POOL.address.toBuffer(), m.wallet.toBuffer()]);
    accounts.set(
      address.toBase58(),
      await coder.encode("Member", {
        pool: MOCK_POOL.address,
        wallet: m.wallet,
        has_won: false,
        won_round: 0,
        stake_deposited: m.stakeDeposited ?? false,
        stake_amount: new BN(m.stakeDeposited ? MOCK_POOL.lamportsPerRound : 0),
        payments_made: 0,
        joined_at: new BN(1_750_000_000 + i),
        position: i + 1,
        bump: 255,
        in_default: m.inGracePeriod ?? false,
        in_grace_period: m.inGracePeriod ?? false,
        grace_deadline: new BN(m.inGracePeriod ? Math.floor(Date.now() / 1000) + 86_400 : 0),
        is_kicked: m.isKicked ?? false,
        missed_rounds: m.inGracePeriod ? 1 : 0,
      })
    );
  }
  for (const wallet of scenario.paid ?? []) {
    const address = pda([
      Buffer.from("payment"),
      MOCK_POOL.address.toBuffer(),
      wallet.toBuffer(),
      Buffer.from([round]),
    ]);
    accounts.set(
      address.toBase58(),
      await coder.encode("Payment", {
        pool: MOCK_POOL.address,
        member: wallet,
        round,
        amount: new BN(MOCK_POOL.lamportsPerRound),
        paid_at: new BN(1_750_000_100),
        bump: 255,
      })
    );
  }

  const toAccount = (data: Buffer) => ({
    data: [data.toString("base64"), "base64"],
    executable: false,
    lamports: 10_000_000,
    owner: PROGRAM_ID.toBase58(),
    rentEpoch: 0,
    space: data.length,
  });
  const context = { slot: 1, apiVersion: "1.18.26" };
  const matches = (data: Buffer, filters: { memcmp?: { offset: number; bytes: string } }[]) =>
    filters.every((f) => {
      if (!f.memcmp) return true;
      const want = Buffer.from(utils.bytes.bs58.decode(f.memcmp.bytes));
      return data.subarray(f.memcmp.offset, f.memcmp.offset + want.length).equals(want);
    });

  const answer = (method: string, params: unknown[]) => {
    switch (method) {
      case "getAccountInfo": {
        const data = accounts.get(params[0] as string);
        return { context, value: data ? toAccount(data) : null };
      }
      case "getMultipleAccounts":
        return {
          context,
          value: (params[0] as string[]).map((k) => {
            const data = accounts.get(k);
            return data ? toAccount(data) : null;
          }),
        };
      case "getBalance":
        return { context, value: 0 };
      case "getProgramAccounts": {
        const filters = ((params[1] as { filters?: unknown[] })?.filters ?? []) as {
          memcmp?: { offset: number; bytes: string };
        }[];
        return [...accounts]
          .filter(([, data]) => matches(data, filters))
          .map(([pubkey, data]) => ({ pubkey, account: toAccount(data) }));
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
// It refuses to sign, but records each transaction it was asked to sign
// (see signRequests) so tests can check what the UI would have sent.
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
            signTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
              // Record what the app asked to sign so tests can decode it, then refuse.
              const w = window as unknown as { __e2eSignRequests?: number[][] };
              (w.__e2eSignRequests ??= []).push(...inputs.map((i) => [...i.transaction]));
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

/** Instructions for the Arisan program in every transaction the mock wallet was asked to sign. */
export async function signRequests(page: Page) {
  const raw = await page.evaluate(
    () => (window as unknown as { __e2eSignRequests?: number[][] }).__e2eSignRequests ?? []
  );
  const coder = new BorshInstructionCoder(idl as Idl);
  return raw.flatMap((bytes) => {
    const tx = Transaction.from(Buffer.from(bytes));
    return tx.instructions
      .filter((ix) => ix.programId.equals(PROGRAM_ID))
      .map((ix) => {
        const decoded = coder.decode(ix.data);
        if (!decoded) throw new Error("Arisan instruction did not decode against the IDL");
        return decoded;
      });
  });
}
