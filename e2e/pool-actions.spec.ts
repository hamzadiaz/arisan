import { test, expect, type Page } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";
import {
  MOCK_POOL,
  MOCK_WALLET,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  proof,
  signRequests,
  type MockScenario,
} from "./helpers";

// The pool screen's primary action for each member state, and the instruction it asks
// the wallet to sign. Accounts come from the fake chain in helpers.ts.

const me = new PublicKey(MOCK_WALLET.address);
const other = new PublicKey("Fr1ends1111111111111111111111111111111111111");
const third = new PublicKey("Thrd111111111111111111111111111111111111111");
const main = (page: Page) => page.locator("main");
const subDial = (page: Page, label: string) => main(page).locator(".bz-subdial", { hasText: label });

async function openPool(page: Page, scenario: MockScenario) {
  await installMockWallet(page);
  const chain = await mockRpcWithPool(page, scenario);
  await gotoReady(page, `/pools/${MOCK_POOL.address.toBase58()}`);
  await connectMockWallet(page);
  await expect(page.locator("header h1")).toHaveText(MOCK_POOL.name);
  return chain;
}

async function expectSigned(page: Page, button: string, ...instructions: RegExp[]) {
  await main(page).getByRole("button", { name: button }).click();
  await expect(page.getByText("Transaction failed")).toBeVisible();
  const ixs = await signRequests(page);
  expect(ixs.map((ix) => ix.name)).toEqual(instructions.map((i) => expect.stringMatching(i)));
  return ixs;
}

test.describe("Pending pool", () => {
  test("a visitor is sent to Join with an invite code", async ({ page }) => {
    await openPool(page, { members: [{ wallet: other, stakeDeposited: true }] });
    await expect(main(page).getByRole("link", { name: "Join with code" })).toHaveAttribute(
      "href",
      "/join"
    );
  });

  test("a member without a stake deposits it, and sees how much", async ({ page }) => {
    await openPool(page, { members: [{ wallet: me }, { wallet: other, stakeDeposited: true }] });
    await expect(main(page).getByRole("button", { name: "Deposit stake · 0.5 SOL" })).toBeVisible();
    await expectSigned(page, "Deposit stake", /^deposit_?[sS]take$/);
  });

  test("the authority cannot start until every member has staked (E2E-10)", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 2,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other }],
    });
    // One button; the reason sits under it
    const btn = main(page).getByRole("button", { name: "Start circle" });
    await expect(btn).toBeDisabled();
    await expect(main(page).getByText("1 seat still needs to stake.")).toBeVisible();
    await proof(page, "p-waiting-for-stakes");
  });

  test("the authority cannot start below capacity (E2E-14, #13)", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 3,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }],
    });
    await expect(main(page).getByRole("button", { name: "Start circle" })).toBeDisabled();
    await expect(main(page).getByText("1 seat still open.")).toBeVisible();
  });

  test("the authority starts a full pool once everyone has staked", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 2,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }],
    });
    await expectSigned(page, "Start circle", /^start_?[pP]ool$/);
  });

  test("a member can leave before the start, after confirming", async ({ page }) => {
    await openPool(page, { members: [{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }] });
    await expect(main(page).getByRole("button", { name: "Staked · 3 seats open" })).toBeDisabled();
    await main(page).getByRole("button", { name: "Leave circle" }).click();
    await expect(main(page).getByText("Your 0.5 SOL stake comes back to you.")).toBeVisible();
    await expectSigned(page, "Leave", /^leave_?[pP]ool$/);
  });
});

test.describe("Active pool", () => {
  const active = (members: MockScenario["members"], paid: PublicKey[] = []): MockScenario => ({
    status: "Active",
    currentRound: 1,
    members,
    paid,
  });

  test("a staked member pays the round", async ({ page }) => {
    await openPool(page, active([{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }]));
    await expect(subDial(page, "Paid")).toContainText("0/2");
    await proof(page, "p-pay");
    await expectSigned(page, "Pay 0.5 SOL", /^make_?[pP]ayment$/);
  });

  test("a member who paid sees it and cannot pay twice", async ({ page }) => {
    await openPool(
      page,
      active([{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }], [me])
    );
    await expect(main(page).getByRole("button", { name: "Paid for round 1" })).toBeDisabled();
    await expect(subDial(page, "Paid")).toContainText("1/2");
  });

  test("a slashed member in grace is offered a restake, not a failing Pay (E2E-11)", async ({
    page,
  }) => {
    await openPool(page, active([{ wallet: me, inGracePeriod: true }, { wallet: other, stakeDeposited: true }]));
    await expect(main(page).getByRole("button", { name: /^Pay / })).toHaveCount(0);
    await expect(main(page).getByText("You missed a round.")).toBeVisible();
    await proof(page, "p-restake");
    // Restaking alone would leave the seat unpaid and markable again: it pays the round too
    await expectSigned(page, "Restake and pay · 1 SOL", /^deposit_?[sS]take$/, /^make_?[pP]ayment$/);
  });

  test("an unstaked member of a started pool is told payments are blocked (E2E-10)", async ({
    page,
  }) => {
    await openPool(page, active([{ wallet: me }, { wallet: other, stakeDeposited: true }]));
    await expect(main(page).getByRole("button", { name: "Payments blocked: no stake" })).toBeDisabled();
    await expect(main(page).getByRole("button", { name: /^Pay / })).toHaveCount(0);
  });

  test("a removed member can rejoin by paying a fresh stake and the missed round", async ({ page }) => {
    await openPool(page, active([{ wallet: me, isKicked: true }, { wallet: other, stakeDeposited: true }]));
    await expect(main(page).getByText("You were removed for missing a payment.")).toBeVisible();
    // A fresh stake (0.5) and the missed round (0.5), then this round (0.5), in one transaction
    await expectSigned(page, "Rejoin and pay · 1.5 SOL", /^rejoin_?[pP]ool$/, /^make_?[pP]ayment$/);
  });

  test("a payment the wallet can't cover is held back, with a faucet link", async ({ page }) => {
    await openPool(page, {
      ...active([{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }]),
      walletLamports: 100_000_000,
    });
    await expect(main(page).getByRole("button", { name: "Pay 0.5 SOL" })).toBeDisabled();
    await expect(main(page).getByText("Not enough SOL.")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Get devnet SOL" })).toHaveAttribute("href", "https://faucet.solana.com");
  });
});

test.describe("Draw, missed payments and refunds", () => {
  const due = (members: MockScenario["members"], paid: PublicKey[], extra: Partial<MockScenario> = {}): MockScenario => ({
    status: "Active",
    currentRound: 1,
    maxMembers: members!.length,
    nextDrawIn: -600,
    members,
    paid,
    ...extra,
  });
  const staked = (wallet: PublicKey) => ({ wallet, stakeDeposited: true });

  test("the draw opens after the deadline once every seat has paid, and commits first", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me, other]));
    await expect(main(page).getByText("Two steps", { exact: false })).toBeVisible();
    await expect(subDial(page, "Draw")).toContainText("Ready");
    await expectSigned(page, "Draw now", /^commit_?[dD]raw_?[rR]andomness$/);
  });

  test("an unpaid seat past the deadline is marked before any draw", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me]));
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
    await expect(main(page).getByText("Their stake covers the pot.", { exact: false })).toBeVisible();
    await expectSigned(page, "Mark missed payment", /^mark_?[dD]efaulter$/);
  });

  test("two missed seats are marked with one approval", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other), staked(third)], [me]));
    await main(page).getByRole("button", { name: "Mark 2 missed payments" }).click();
    await expect(page.getByText("Transaction failed")).toBeVisible();
    const ixs = await signRequests(page);
    expect(ixs.map((ix) => ix.name)).toEqual([
      expect.stringMatching(/^mark_?[dD]efaulter$/),
      expect.stringMatching(/^mark_?[dD]efaulter$/),
    ]);
  });

  test("a seat marked this round is covered by its slashed stake, so the draw opens", async ({ page }) => {
    // Marked a minute ago: its grace started after this round's deadline
    await openPool(page, due([staked(me), { wallet: other, inGracePeriod: true, graceEndsIn: 172_740 }], [me]));
    await expect(main(page).getByRole("button", { name: "Draw now" })).toBeEnabled();
  });

  test("a seat still in grace from an earlier round holds the draw", async ({ page }) => {
    await openPool(page, due([staked(me), { wallet: other, inGracePeriod: true }], [me]));
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: /^Mark/ })).toHaveCount(0);
    await expect(main(page).getByText("Waiting for 1 seat in grace to pay.")).toBeVisible();
  });

  test("the draw waits for the deadline even when everyone has paid", async ({ page }) => {
    await openPool(page, { ...due([staked(me), staked(other)], [me, other]), nextDrawIn: 3_600 });
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Paid for round 1" })).toBeDisabled();
  });

  test("a half-done draw is finished with one approval, without a new commit", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me, other], { committedSlot: 900, slot: 1000 }));
    await expect(main(page).getByText("Last step.", { exact: false })).toBeVisible();
    await expectSigned(page, "Finish the draw", /^execute_?[dD]raw$/);
  });

  test("an expired draw is explained, not retried", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me, other], { committedSlot: 900, slot: 2_000 }));
    await expect(main(page).getByText("This circle is locked.")).toBeVisible();
    await expect(main(page).getByRole("button", { name: /draw/i })).toHaveCount(0);
  });

  test("a stale page can't start the draw for a round that already moved", async ({ page }) => {
    const chain = await openPool(page, due([staked(me), staked(other)], [me, other]));
    await expect(main(page).getByRole("button", { name: "Draw now" })).toBeEnabled();
    // Someone else drew round 1 while this page sat open
    await chain.update({ ...due([staked(me), staked(other)], []), currentRound: 2, nextDrawIn: 240 });
    await main(page).getByRole("button", { name: "Draw now" }).click();
    await expect(page.getByText("This round was already drawn.")).toBeVisible();
    expect(await signRequests(page)).toHaveLength(0);
  });

  test("a seat marked without a stake to slash holds the draw", async ({ page }) => {
    await openPool(page, due([staked(me), { wallet: other, inGracePeriod: true, inDefault: false, graceEndsIn: 172_740 }], [me]));
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
    await expect(main(page).getByText("Waiting for 1 seat in grace to pay.")).toBeVisible();
  });

  test("in a stake-free circle a marked seat holds the draw: nothing covers its share", async ({ page }) => {
    await openPool(
      page,
      due([{ wallet: me }, { wallet: other, inGracePeriod: true, inDefault: false, graceEndsIn: 172_740 }], [me], { stakeEnabled: false })
    );
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
    await expect(main(page).getByText("Waiting for 1 seat in grace to pay.")).toBeVisible();
  });

  test("automatic circles leave the first two minutes after the deadline to the server", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me, other], { autoMode: true, nextDrawIn: -90 }));
    await expect(main(page).getByRole("button", { name: "Paid for round 1" })).toBeDisabled();
    await expect(main(page).getByRole("button", { name: "Draw now" })).toHaveCount(0);
  });

  test("a seat whose grace is over is removed, and the button says so", async ({ page }) => {
    await openPool(page, due([staked(me), { wallet: other, inGracePeriod: true, graceEndsIn: -3_600 }], [me]));
    await expect(main(page).getByText("keep the circle from finishing", { exact: false })).toBeVisible();
    await expectSigned(page, "Remove 1 seat", /^mark_?[dD]efaulter$/);
  });

  test("with a draw started, an unpaid member pays first", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [other], { committedSlot: 900, slot: 1000 }));
    await expect(main(page).getByText("A draw has started.")).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Finish the draw" })).toHaveCount(0);
    await expectSigned(page, "Pay 0.5 SOL", /^make_?[pP]ayment$/);
  });

  test("before the deadline only the host can finish a draw they started early", async ({ page }) => {
    await openPool(page, due([staked(me), staked(other)], [me, other], { committedSlot: 900, slot: 1000, nextDrawIn: 600 }));
    await expect(main(page).getByText("The host started this draw early.")).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Finish the draw" })).toHaveCount(0);
  });

  test("a finished circle gives the stake back", async ({ page }) => {
    await openPool(page, { status: "Completed", members: [staked(me), staked(other)] });
    await expectSigned(page, "Get 0.5 SOL back", /^claim_?[sS]take_?[rR]efund$/);
  });

  test("anyone can send the remaining stakes back once a circle is complete", async ({ page }) => {
    await openPool(page, { status: "Completed", members: [{ wallet: me }, staked(other)] });
    await expectSigned(page, "Return the last stake", /^refund_?[aA]ll_?[sS]takes$/);
  });
});
