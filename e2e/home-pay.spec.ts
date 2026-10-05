import { test, expect } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";
import {
  MOCK_POOL,
  MOCK_WALLET,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  signRequests,
} from "./helpers";

const me = new PublicKey(MOCK_WALLET.address);
const other = new PublicKey("Fr1ends1111111111111111111111111111111111111");

test("Home shows your Due on the row and pays the next circle in place", async ({ page }) => {
  await installMockWallet(page);
  await mockRpcWithPool(page, {
    status: "Active",
    currentRound: 1,
    members: [
      { wallet: me, stakeDeposited: true },
      { wallet: other, stakeDeposited: true },
    ],
    paid: [other],
  });
  await gotoReady(page, "/");
  await connectMockWallet(page);

  await expect(page.getByText("1/2 paid this round")).toBeVisible();
  await expect(page.locator("main li", { hasText: MOCK_POOL.name }).getByText("Due")).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Pay 0.5 SOL" }).click();
  await expect(page.getByText("Transaction failed")).toBeVisible();
  const ixs = await signRequests(page);
  expect(ixs.map((ix) => ix.name)).toEqual([expect.stringMatching(/^make_?[pP]ayment$/)]);
});

test("a transaction that lands but fails on-chain is reported as failed, not done", async ({ page }) => {
  await installMockWallet(page, { sends: true });
  await mockRpcWithPool(page, { sendFails: true, sentTx: { indexedAfter: 0, returnData: "Q7K2M9XA" } });
  await gotoReady(page, "/pools/create");
  await connectMockWallet(page);
  await page.getByPlaceholder("Family circle").fill("Office lunch");
  await page.getByPlaceholder("0.5").fill("0.25");
  await page.getByRole("button", { name: "Create circle" }).click();

  await expect(page.getByText("Transaction failed on-chain", { exact: false })).toBeVisible();
  await expect(page.locator("header h1")).toHaveText("New circle");
  await expect(page.getByText("Q7K2M9XA")).toHaveCount(0);
});
