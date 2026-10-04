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

/** Minimal confirmed-transaction RPC result carrying program return data. */
function confirmedTransaction(signature: string, returnData: string) {
  return {
    slot: 1,
    blockTime: 1_750_000_000,
    version: "legacy",
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [MOCK_WALLET.address, PROGRAM_ID.toBase58()],
        header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 },
        instructions: [{ programIdIndex: 1, accounts: [0], data: "" }],
        recentBlockhash: PublicKey.default.toBase58(),
      },
    },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [0, 0],
      postBalances: [0, 0],
      innerInstructions: [],
      logMessages: ["Program log: Instruction: CreatePool"],
      preTokenBalances: [],
      postTokenBalances: [],
      loadedAddresses: { writable: [], readonly: [] },
      returnData: {
        programId: PROGRAM_ID.toBase58(),
        data: [Buffer.from(returnData).toString("base64"), "base64"],
      },
      computeUnitsConsumed: 1000,
    },
  };
}

export interface MockMember {
  wallet: PublicKey;
  stakeDeposited?: boolean;
  inGracePeriod?: boolean;
  /** Seconds from now until the grace period ends. Default one day (grace began a day ago). */
  graceEndsIn?: number;
  /** Stake slashed by mark_defaulter. Defaults to inGracePeriod. */
  inDefault?: boolean;
  isKicked?: boolean;
  hasWon?: boolean;
  missedRounds?: number;
}

export interface MockScenario {
  authority?: PublicKey;
  maxMembers?: number;
  status?: "Pending" | "Active" | "Completed";
  currentRound?: number;
  /** Seconds from now to the round's draw deadline (negative = already passed). Default 3 days. */
  nextDrawIn?: number;
  members?: MockMember[];
  /** Wallets that have paid the current round */
  paid?: PublicKey[];
  /** For wallets that send: getTransaction answers null this many times, then the
   *  transaction with `returnData` (base64 of the given string). */
  sentTx?: { indexedAfter: number; returnData: string };
  stakeEnabled?: boolean;
  autoMode?: boolean;
  /** Draw randomness committed for the current round at this slot. */
  committedSlot?: number;
  /** What getSlot answers. Default 1000. */
  slot?: number;
  /** The connected wallet's balance. Default 10 SOL. */
  walletLamports?: number;
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
    max_members: scenario.maxMembers ?? MOCK_POOL.maxMembers,
    member_count: members.filter((m) => !m.isKicked).length,
    contribution_amount: new BN(MOCK_POOL.lamportsPerRound),
    currency: { Sol: {} },
    total_rounds: scenario.maxMembers ?? MOCK_POOL.maxMembers,
    current_round: active ? (scenario.currentRound ?? 1) : 0,
    status: { [scenario.status ?? "Pending"]: {} },
    next_draw_timestamp: new BN(active ? Math.floor(Date.now() / 1000) + (scenario.nextDrawIn ?? 3 * 86_400) : 0),
    invite_code_hash: [...createHash("sha256").update(MOCK_POOL.inviteCode).digest()],
    stake_multiplier: 1,
    bump: 255,
    vault_bump: 255,
    token_vault: PublicKey.default,
    created_at: new BN(1_750_000_000),
    pool_index: new BN(0),
    stake_enabled: scenario.stakeEnabled ?? true,
    grace_period_seconds: new BN(172_800),
    auto_mode: scenario.autoMode ?? false,
    member_wallets: wallets,
    roster_len: members.length,
    randomness_slot: new BN(scenario.committedSlot ?? 0),
    randomness_round: scenario.committedSlot !== undefined && active ? (scenario.currentRound ?? 1) : 0,
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
        has_won: m.hasWon ?? false,
        won_round: m.hasWon ? 1 : 0,
        stake_deposited: m.stakeDeposited ?? false,
        stake_amount: new BN(m.stakeDeposited ? MOCK_POOL.lamportsPerRound : 0),
        payments_made: 0,
        joined_at: new BN(1_750_000_000 + i),
        position: i + 1,
        bump: 255,
        in_default: m.inDefault ?? m.inGracePeriod ?? false,
        in_grace_period: m.inGracePeriod ?? false,
        grace_deadline: new BN(m.inGracePeriod ? Math.floor(Date.now() / 1000) + (m.graceEndsIn ?? 86_400) : 0),
        is_kicked: m.isKicked ?? false,
        missed_rounds: m.missedRounds ?? (m.inGracePeriod || m.isKicked ? 1 : 0),
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

  // SlotHashes holds the committed slot's hash, so a half-done draw can be finished.
  const sysvars = new Map<string, Buffer>();
  if (scenario.committedSlot !== undefined) {
    const slotHashes = Buffer.alloc(8 + 40);
    slotHashes.writeBigUInt64LE(BigInt(1), 0);
    slotHashes.writeBigUInt64LE(BigInt(scenario.committedSlot), 8);
    createHash("sha256").update("slot").digest().copy(slotHashes, 16);
    sysvars.set("SysvarS1otHashes111111111111111111111111111", slotHashes);
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
        const data = accounts.get(params[0] as string) ?? sysvars.get(params[0] as string);
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
        return {
          context,
          value: params[0] === MOCK_WALLET.address ? (scenario.walletLamports ?? 10_000_000_000) : 0,
        };
      case "getSlot":
        return scenario.slot ?? 1000;
      case "getProgramAccounts": {
        const filters = ((params[1] as { filters?: unknown[] })?.filters ?? []) as {
          memcmp?: { offset: number; bytes: string };
        }[];
        return [...accounts]
          .filter(([, data]) => matches(data, filters))
          .map(([pubkey, data]) => ({ pubkey, account: toAccount(data) }));
      }
      case "getLatestBlockhash":
        return {
          context,
          value: { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 1_000_000 },
        };
      case "getBlockHeight":
        return 1;
      case "getSignatureStatuses":
        return {
          context,
          value: (params[0] as string[]).map(() => ({
            slot: 1,
            confirmations: null,
            err: null,
            confirmationStatus: "confirmed",
          })),
        };
      case "getTransaction": {
        const sent = scenario.sentTx;
        if (!sent || txLookups++ < sent.indexedAfter) return null;
        return confirmedTransaction(params[0] as string, sent.returnData);
      }
      default:
        return null;
    }
  };
  let txLookups = 0;

  // Subscriptions (confirmTransaction's signatureSubscribe) resolve immediately.
  await page.routeWebSocket(
    (url) => url.hostname === "127.0.0.1" && url.port === "8900",
    (ws) => {
      let nextId = 1;
      ws.onMessage((message) => {
        const req = JSON.parse(String(message));
        if (String(req.method).endsWith("Unsubscribe")) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: true }));
          return;
        }
        const subscription = nextId++;
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: subscription }));
        if (req.method === "signatureSubscribe") {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "signatureNotification",
              params: { subscription, result: { context: { slot: 1 }, value: { err: null } } },
            })
          );
        }
      });
    }
  );

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

/**
 * `sends: true` adds solana:signAndSendTransaction, returning a fixed signature without
 * broadcasting (the fake chain then confirms it). Otherwise the wallet refuses to sign.
 */
export async function installMockWallet(page: Page, options: { sends?: boolean } = {}) {
  const publicKey = [...new PublicKey(MOCK_WALLET.address).toBytes()];
  await page.addInitScript(
    ({ name, address, publicKey, sends }) => {
      const chains = ["solana:devnet", "solana:testnet", "solana:mainnet", "solana:localnet"];
      const account = {
        address,
        publicKey: new Uint8Array(publicKey),
        chains,
        features: sends
          ? ["solana:signTransaction", "solana:signAndSendTransaction"]
          : ["solana:signTransaction"],
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
          ...(sends
            ? {
                "solana:signAndSendTransaction": {
                  version: "1.0.0",
                  supportedTransactionVersions: ["legacy", 0],
                  signAndSendTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
                    const w = window as unknown as { __e2eSignRequests?: number[][] };
                    (w.__e2eSignRequests ??= []).push(...inputs.map((i) => [...i.transaction]));
                    return inputs.map(() => ({ signature: new Uint8Array(64).fill(7) }));
                  },
                },
              }
            : {}),
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
    { name: MOCK_WALLET.name, address: MOCK_WALLET.address, publicKey, sends: !!options.sends }
  );
}

/** Connect the mock wallet through the real header chip and wallet sheet. */
export async function connectMockWallet(page: Page) {
  await openWalletSheet(page, () =>
    page.locator("header").getByRole("button", { name: "Connect", exact: true }).click()
  );
  await walletSheet(page).getByRole("button", { name: new RegExp(MOCK_WALLET.name) }).click();
  await expect(page.locator("header").getByText(MOCK_WALLET_SHORT)).toBeVisible();
  // Let the sheet finish closing so proofs don't catch it mid-fade
  await expect(page.locator(".wallet-adapter-modal")).toHaveCount(0);
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
