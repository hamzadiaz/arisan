import { test, expect } from "@playwright/test";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { gotoReady } from "./helpers";
import { connect, drawRound, main, memberPage, tap } from "./chain-helpers";

// A whole circle through the real UI against a local validator running this repo's program,
// with wallets that really sign. Opt-in: needs CHAIN_RPC (e.g. http://127.0.0.1:18899) and an
// app built with NEXT_PUBLIC_SOLANA_RPC_URL set to the same URL. See docs/bezel/devnet.md.
//
//   CHAIN_RPC=http://127.0.0.1:18899 PW_NO_SERVER=1 E2E_PORT=3121 npx playwright test e2e/chain.spec.ts
//
// Rounds are 1 minute on-chain (DRAW_INTERVAL), so this takes a few minutes.

const RPC = process.env.CHAIN_RPC;
test.skip(!RPC, "needs CHAIN_RPC and a local validator");
test.use({ storageState: { cookies: [], origins: [] } });

const ROUND_MS = 60_000;

test("a two-seat circle runs end to end through the UI on a real chain", async ({ browser, baseURL }) => {
  test.setTimeout(30 * 60_000);
  const connection = new Connection(RPC!, "confirmed");
  const host = Keypair.generate();
  const guest = Keypair.generate();
  for (const kp of [host, guest]) {
    await connection.confirmTransaction(await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL), "confirmed");
  }
  const A = await memberPage(browser, baseURL, host, "Chain Host");
  const B = await memberPage(browser, baseURL, guest, "Chain Guest");

  // Host creates a two-seat circle and takes the first seat with the code just shown
  await gotoReady(A, "/pools/create");
  await connect(A, "Chain Host");
  for (let i = 0; i < 3; i++) await tap(A, "Fewer seats");
  await expect(A.getByText("seats · 2 rounds")).toBeVisible();
  await A.getByPlaceholder("Family circle").fill("Chain circle");
  await A.getByPlaceholder("0.5").fill("0.01");
  await tap(A, "Create circle");
  await expect(A.locator("header h1")).toHaveText("Circle created", { timeout: 60_000 });
  const code = (await A.locator("main button span.font-mono").first().innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await tap(A, "Take your seat");
  await expect(main(A).getByRole("button", { name: "You’re seated" })).toBeDisabled({ timeout: 60_000 });
  await main(A).getByRole("button", { name: "Open circle" }).click();
  await expect(A.locator("header h1")).toHaveText("Chain circle", { timeout: 30_000 });
  await tap(A, /^Deposit stake · 0\.01 SOL/);
  await expect(main(A).getByRole("button", { name: "Start circle" })).toBeDisabled({ timeout: 60_000 });
  await expect(main(A).getByText("1 seat still open.")).toBeVisible();

  // Guest joins with the code, stakes
  await gotoReady(B, "/join");
  await connect(B, "Chain Guest");
  await B.getByPlaceholder("ABCD1234").fill(code);
  // The eighth character looks the circle up by itself
  await expect(B.getByRole("heading", { name: "Chain circle" })).toBeVisible({ timeout: 30_000 });
  await tap(B, "Join circle");
  await expect(B.locator("header h1")).toHaveText("Chain circle", { timeout: 60_000 });
  await tap(B, /^Deposit stake · 0\.01 SOL/);
  await expect(main(B).getByRole("button", { name: "You’re in · waiting for the host" })).toBeDisabled({ timeout: 60_000 });

  // Host starts; both pay round 1
  await A.reload();
  await tap(A, "Start circle", 60_000);
  // Let the start land before reloading anything: a reload can abort the send
  await expect(A.getByText("Circle started")).toBeVisible({ timeout: 60_000 });
  for (const page of [A, B]) {
    await page.reload();
    await tap(page, "Pay 0.01 SOL", 60_000);
    await expect(main(page).getByRole("button", { name: "Paid for round 1" })).toBeDisabled({ timeout: 60_000 });
  }

  // After the deadline the guest draws: start, then finish
  await drawRound(B, 1, ROUND_MS + 3 * 60_000);
  // The last-draw note names the winner (either seat can win)
  await expect(main(B).locator(".bz-note", { hasText: "took round 1" })).toBeVisible({ timeout: 30_000 });

  // Round 2: both pay, the host draws; the circle completes
  for (const page of [A, B]) {
    await page.reload();
    await tap(page, "Pay 0.01 SOL", 60_000);
    await expect(main(page).getByRole("button", { name: "Paid for round 2" })).toBeDisabled({ timeout: 60_000 });
  }
  await drawRound(A, 2, ROUND_MS + 3 * 60_000);

  // Both take their stake back
  for (const page of [A, B]) {
    await page.reload();
    await tap(page, "Get 0.01 SOL back", 60_000);
    await expect(page.getByText("Stake returned")).toBeVisible({ timeout: 60_000 });
  }
  await A.reload();
  await expect(main(A).getByText("Complete", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(main(A).getByRole("button", { name: /back$/ })).toHaveCount(0);
});
