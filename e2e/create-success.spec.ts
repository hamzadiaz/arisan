import { test, expect } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";
import {
  MOCK_WALLET,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  proof,
  signRequests,
} from "./helpers";
import idl from "../src/lib/solana/idl.json";

// Create → invite shown once. The mock wallet "sends" (signAndSendTransaction) and the
// fake chain confirms; the invite code comes back only through transaction return data.

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const expectedPool = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), new PublicKey(MOCK_WALLET.address).toBuffer(), Buffer.alloc(8)],
  PROGRAM_ID
)[0];

async function createPool(page: import("@playwright/test").Page) {
  await gotoReady(page, "/pools/create");
  await connectMockWallet(page);
  await page.getByPlaceholder("Family circle").fill("Office lunch");
  await page.getByPlaceholder("0.5").fill("0.25");
  await page.getByRole("button", { name: "Create circle" }).click();
}

test("the invite code is shown once, copies, and opens the pool (E2E-13)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installMockWallet(page, { sends: true });
  // Not indexed for the first 3 lookups: a single read-back used to lose the code
  await mockRpcWithPool(page, { sentTx: { indexedAfter: 3, returnData: "Q7K2M9XA" } });
  await createPool(page);

  await expect(page.locator("header h1")).toHaveText("Circle created", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Office lunch" })).toBeVisible();
  await expect(page.getByText("Q7K2M9XA")).toBeVisible();
  await expect(page.getByText("Shown once. Save it now.")).toBeVisible();
  await proof(page, "c-invite-shown-once");

  await page.getByText("Q7K2M9XA").click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Q7K2M9XA");

  const ixs = await signRequests(page);
  expect(ixs.map((ix) => ix.name)).toEqual([expect.stringMatching(/^create_?[pP]ool$/)]);

  await page.getByRole("button", { name: "Open circle" }).click();
  await expect(page).toHaveURL(new RegExp(`/pools/${expectedPool.toBase58()}$`));
});

test("Take your seat joins the new circle with the code just shown", async ({ page }) => {
  await installMockWallet(page, { sends: true });
  await mockRpcWithPool(page, { sentTx: { indexedAfter: 1, returnData: "Q7K2M9XA" } });
  await createPool(page);
  await expect(page.getByText("Q7K2M9XA")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Take your seat" }).click();
  // The code is shown only here, so the screen stays: seated, with Share and the code still on it
  await expect(page.getByRole("button", { name: "You’re seated" })).toBeDisabled({ timeout: 20_000 });
  await expect(page.getByText("Q7K2M9XA")).toBeVisible();
  await expect(page).toHaveURL(/\/pools\/create$/);
  const ixs = await signRequests(page);
  expect(ixs.map((ix) => ix.name)).toEqual([expect.stringMatching(/^create_?[pP]ool$/), expect.stringMatching(/^join_?[pP]ool$/)]);
  // The join carries the code that was shown
  expect((ixs[1].data as { invite_code?: string; inviteCode?: string }).invite_code ?? (ixs[1].data as { inviteCode?: string }).inviteCode).toBe("Q7K2M9XA");

  await page.getByRole("button", { name: "Open circle" }).click();
  await expect(page).toHaveURL(new RegExp(`/pools/${expectedPool.toBase58()}$`));
});

test("Automatic draws create an auto circle, and its seat takes the stake on join", async ({ page }) => {
  await installMockWallet(page, { sends: true });
  await mockRpcWithPool(page, { sentTx: { indexedAfter: 1, returnData: "Q7K2M9XA" } });
  await gotoReady(page, "/pools/create");
  await connectMockWallet(page);
  await page.getByPlaceholder("Family circle").fill("Office lunch");
  await page.getByPlaceholder("0.5").fill("0.25");
  await page.getByRole("button", { name: "Automatic", exact: true }).click();
  await expect(page.getByText("Starts when full, draws on its own")).toBeVisible();
  await page.getByRole("button", { name: "Create circle" }).click();

  await expect(page.getByRole("button", { name: "Take your seat · 0.25 SOL stake" })).toBeVisible({ timeout: 20_000 });
  const [create] = await signRequests(page);
  expect((create.data as { auto_mode?: boolean; autoMode?: boolean }).auto_mode ?? (create.data as { autoMode?: boolean }).autoMode).toBe(true);
});

test("if the code never comes back the screen says so, and invents nothing", async ({ page }) => {
  test.setTimeout(60_000);
  await installMockWallet(page, { sends: true });
  await mockRpcWithPool(page, { sentTx: { indexedAfter: 1_000, returnData: "NEVERSHOWN" } });
  await createPool(page);

  await expect(page.locator("header h1")).toHaveText("Circle created", { timeout: 40_000 });
  await expect(page.getByText("Couldn’t read the invite code.")).toBeVisible();
  await expect(page.getByText("Shown once.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open circle" })).toBeVisible();
});
