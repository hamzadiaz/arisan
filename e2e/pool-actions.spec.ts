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
const main = (page: Page) => page.locator("main");

async function openPool(page: Page, scenario: MockScenario) {
  await installMockWallet(page);
  await mockRpcWithPool(page, scenario);
  await gotoReady(page, `/pools/${MOCK_POOL.address.toBase58()}`);
  await connectMockWallet(page);
  await expect(page.locator("header h1")).toHaveText(MOCK_POOL.name);
}

async function expectSigned(page: Page, button: string, instruction: RegExp) {
  await main(page).getByRole("button", { name: button }).click();
  await expect(page.getByText("Transaction Failed")).toBeVisible();
  const ixs = await signRequests(page);
  expect(ixs.map((ix) => ix.name)).toEqual([expect.stringMatching(instruction)]);
}

test.describe("Pending pool", () => {
  test("a visitor is sent to Join with an invite code", async ({ page }) => {
    await openPool(page, { members: [{ wallet: other, stakeDeposited: true }] });
    await expect(main(page).getByRole("link", { name: "Join with code" })).toHaveAttribute(
      "href",
      "/join"
    );
  });

  test("a member without a stake deposits it", async ({ page }) => {
    await openPool(page, { members: [{ wallet: me }, { wallet: other, stakeDeposited: true }] });
    await expectSigned(page, "Deposit stake", /^deposit_?[sS]take$/);
  });

  test("the authority cannot start until every member has staked (E2E-10)", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 2,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other }],
    });
    const btn = main(page).getByRole("button", { name: "Waiting for stakes (1/2)" });
    await expect(btn).toBeDisabled();
    await proof(page, "p-waiting-for-stakes");
  });

  test("the authority cannot start below capacity (E2E-14, #13)", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 3,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }],
    });
    await expect(main(page).getByRole("button", { name: "Waiting for members (2/3)" })).toBeDisabled();
    await expect(main(page).getByRole("button", { name: "Start pool" })).toHaveCount(0);
  });

  test("the authority starts a full pool once everyone has staked", async ({ page }) => {
    await openPool(page, {
      authority: me,
      maxMembers: 2,
      members: [{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }],
    });
    await expectSigned(page, "Start pool", /^start_?[pP]ool$/);
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
    await expect(main(page).getByText("0/2 paid this round")).toBeVisible();
    await proof(page, "p-pay");
    await expectSigned(page, "Pay 0.5 SOL", /^make_?[pP]ayment$/);
  });

  test("a member who paid sees it and cannot pay twice", async ({ page }) => {
    await openPool(
      page,
      active([{ wallet: me, stakeDeposited: true }, { wallet: other, stakeDeposited: true }], [me])
    );
    await expect(main(page).getByRole("button", { name: "Paid for round 1" })).toBeDisabled();
    await expect(main(page).getByText("1/2 paid this round")).toBeVisible();
  });

  test("a slashed member in grace is offered a restake, not a failing Pay (E2E-11)", async ({
    page,
  }) => {
    await openPool(page, active([{ wallet: me, inGracePeriod: true }, { wallet: other, stakeDeposited: true }]));
    await expect(main(page).getByRole("button", { name: /^Pay / })).toHaveCount(0);
    await proof(page, "p-restake");
    await expectSigned(page, "Restake to stay in", /^deposit_?[sS]take$/);
  });

  test("an unstaked member of a started pool is told payments are blocked (E2E-10)", async ({
    page,
  }) => {
    await openPool(page, active([{ wallet: me }, { wallet: other, stakeDeposited: true }]));
    await expect(
      main(page).getByRole("button", { name: "No stake deposited · payments are blocked" })
    ).toBeDisabled();
    await expect(main(page).getByRole("button", { name: /^Pay / })).toHaveCount(0);
  });

  test("a removed member cannot act", async ({ page }) => {
    await openPool(page, active([{ wallet: me, isKicked: true }, { wallet: other, stakeDeposited: true }]));
    await expect(main(page).getByRole("button", { name: "You were removed from this pool" })).toBeDisabled();
  });
});
