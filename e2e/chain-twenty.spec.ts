import { test, expect, type Page } from "@playwright/test";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import idl from "../src/lib/solana/idl.json";
import { gotoReady } from "./helpers";
import { connect, drawRound, main, memberPage, tap } from "./chain-helpers";

// A full twenty-seat circle through the real UI, with twenty wallets that really sign, against
// a local validator running this repo's program: create, nineteen joins by invite link, twenty
// stakes, start, twenty rounds of twenty payments and a draw, then every stake back. The chain
// is checked at the end. Opt-in, like chain.spec.ts:
//
//   CHAIN_RPC=http://127.0.0.1:18899 PW_NO_SERVER=1 E2E_PORT=3121 npx playwright test e2e/chain-twenty.spec.ts
//
// CHAIN_SEATS picks another size (2–20); CHAIN_PROOF is a folder for screenshots. Rounds are
// 1 minute on-chain, so twenty seats take about an hour.

const RPC = process.env.CHAIN_RPC;
const SEATS = Number(process.env.CHAIN_SEATS ?? 20);
const PROOF = process.env.CHAIN_PROOF;
test.skip(!RPC, "needs CHAIN_RPC and a local validator");
test.use({ storageState: { cookies: [], origins: [] } });

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const coder = new BorshAccountsCoder(idl as Idl);
const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const ROUND_LAMPORTS = 10_000_000; // 0.01 SOL
/** Seats that act at once, as people in a real circle would */
const AT_ONCE = 5;
async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += AT_ONCE) await Promise.all(items.slice(i, i + AT_ONCE).map(run));
}
const started = Date.now();
const log = (line: string) => console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(5)}s  ${line}`);

test(`a ${SEATS}-seat circle runs end to end through the UI on a real chain`, async ({ browser, baseURL }) => {
  test.setTimeout(115 * 60_000);
  const connection = new Connection(RPC!, "confirmed");
  const keys = Array.from({ length: SEATS }, () => Keypair.generate());
  for (const kp of keys) {
    await connection.confirmTransaction(await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL), "confirmed");
  }
  const seats: Page[] = [];
  for (let i = 0; i < SEATS; i++) seats.push(await memberPage(browser, baseURL, keys[i], `Seat ${i + 1}`));
  const host = seats[0];
  const name = `Circle of ${SEATS}`;
  // Seats leave the circle page when they're done: twenty open pages reloading on every change
  // would swamp the one local RPC, which a real circle (a phone each) never does
  const rest = (page: Page) => page.goto("about:blank");
  const shot = async (page: Page, file: string) => {
    if (PROOF) await page.screenshot({ path: `${PROOF}/${file}.png`, fullPage: true });
  };

  // The host creates the circle and takes the first seat with the code just shown
  await gotoReady(host, "/pools/create");
  await connect(host, "Seat 1");
  for (let i = 0; i < 25; i++) {
    const summary = await main(host).getByText(/seats · \d+ rounds/).first().innerText();
    const rounds = Number(summary.match(/(\d+) rounds/)![1]);
    if (rounds === SEATS) break;
    await tap(host, rounds < SEATS ? "More seats" : "Fewer seats");
  }
  await host.getByPlaceholder("Family circle").fill(name);
  await host.getByPlaceholder("0.5").fill("0.01");
  await tap(host, "Create circle");
  await expect(host.locator("header h1")).toHaveText("Circle created", { timeout: 60_000 });
  const code = (await host.locator("main button span.font-mono").first().innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await tap(host, "Take your seat");
  await expect(main(host).getByRole("button", { name: "You’re seated" })).toBeDisabled({ timeout: 60_000 });
  await main(host).getByRole("button", { name: "Open circle" }).click();
  await expect(host.locator("header h1")).toHaveText(name, { timeout: 30_000 });
  const url = new URL(host.url()).pathname;
  const pool = new PublicKey(url.split("/").pop()!);
  await tap(host, /^Deposit stake · 0\.01 SOL/);
  await expect(main(host).getByRole("button", { name: "Start circle" })).toBeDisabled({ timeout: 60_000 });
  // The circle page carries the invite while seats are open
  await expect(main(host).getByText(code)).toBeVisible({ timeout: 30_000 });
  log(`created ${pool.toBase58()}`);

  // Everyone else opens the invite link, joins and stakes, a few at a time
  await inBatches(
    seats.slice(1).map((page, j) => ({ page, seat: j + 2 })),
    async ({ page, seat }) => {
      await gotoReady(page, `/join?code=${code}`);
      await connect(page, `Seat ${seat}`);
      await tap(page, "Join circle", 60_000);
      await expect(page.locator("header h1")).toHaveText(name, { timeout: 60_000 });
      await tap(page, /^Deposit stake · 0\.01 SOL/, 60_000);
      await expect(main(page).getByRole("button", { name: /^(Staked|You’re in) ·/ })).toBeDisabled({ timeout: 60_000 });
      await rest(page);
    }
  );
  log(`${SEATS} seats taken and staked`);

  // The host starts it
  await host.goto(url);
  await tap(host, "Start circle", 60_000);
  await expect(host.getByText("Circle started")).toBeVisible({ timeout: 60_000 });
  await shot(host, "started");

  // Every round: all twenty pay, then one seat draws (a different one each round). With
  // 1-minute rounds the late payers' pages already offer Mark or Draw after paying, so each
  // payment is confirmed on-chain rather than by the button that replaces Pay.
  const paid = (wallet: PublicKey, round: number) =>
    connection.getAccountInfo(pda(Buffer.from("payment"), pool.toBuffer(), wallet.toBuffer(), Buffer.from([round])));
  for (let round = 1; round <= SEATS; round++) {
    const roundStart = Date.now();
    await inBatches(
      seats.map((page, i) => ({ page, key: keys[i] })),
      async ({ page, key }) => {
        await page.goto(url);
        await tap(page, "Pay 0.01 SOL", 60_000);
        await expect.poll(async () => !!(await paid(key.publicKey, round)), { timeout: 120_000 }).toBe(true);
        await expect(main(page).getByRole("button", { name: "Pay 0.01 SOL" })).toHaveCount(0, { timeout: 30_000 });
        await rest(page);
      }
    );
    const paidIn = Math.round((Date.now() - roundStart) / 1000);
    const drawer = seats[(round - 1) % SEATS];
    await drawer.goto(url);
    await drawRound(drawer, round, 5 * 60_000);
    await rest(drawer);
    log(`round ${round} paid by all ${SEATS} (${paidIn}s) and drawn`);
    if (round === Math.ceil(SEATS / 2)) {
      await host.goto(url);
      await main(host).getByRole("tab", { name: "History" }).click();
      await shot(host, `round-${round}`);
    }
  }

  // Every stake back: the host takes theirs, then sends the rest back (batches of up to eight)
  const others = SEATS - 1;
  await host.goto(url);
  await tap(host, "Get 0.01 SOL back", 60_000);
  await expect(host.getByText("Stake returned").first()).toBeVisible({ timeout: 60_000 });
  await host.goto(url);
  await tap(host, others === 1 ? "Return the last stake" : `Return ${others} stakes`, 60_000);
  await expect(host.getByText(others === 1 ? "Stake returned" : `${others} stakes returned`).first()).toBeVisible({ timeout: 120_000 });
  await host.goto(url);
  await expect(main(host).getByText("Complete", { exact: true })).toBeVisible({ timeout: 30_000 });
  await shot(host, "complete");

  // The chain agrees: each seat won exactly once and got the whole pot, the vault is empty,
  // and every stake went back
  const drawAccounts = await connection.getMultipleAccountsInfo(
    Array.from({ length: SEATS }, (_, i) => pda(Buffer.from("draw"), pool.toBuffer(), Buffer.from([i + 1])))
  );
  const draws = drawAccounts.map((info) => coder.decode("Draw", info!.data));
  expect(new Set(draws.map((d) => (d.winner as PublicKey).toBase58())).size).toBe(SEATS);
  for (const d of draws) expect(Number(d.amount.toString())).toBe(ROUND_LAMPORTS * SEATS);
  expect(await connection.getBalance(pda(Buffer.from("vault"), pool.toBuffer()))).toBe(0);
  const memberAccounts = await connection.getMultipleAccountsInfo(
    keys.map((k) => pda(Buffer.from("member"), pool.toBuffer(), k.publicKey.toBuffer()))
  );
  for (const info of memberAccounts) {
    const m = coder.decode("Member", info!.data);
    expect(m.has_won ?? m.hasWon).toBe(true);
    expect(m.stake_deposited ?? m.stakeDeposited).toBe(false);
  }
  log(`${SEATS} winners, ${SEATS} pots of ${(ROUND_LAMPORTS * SEATS) / LAMPORTS_PER_SOL} SOL, vault empty, every stake back`);
});
