import { test, expect } from "@playwright/test";
import {
  MOCK_POOL,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  signRequests,
} from "./helpers";

// What the UI actually asks the wallet to sign. The mock wallet records the transaction
// and refuses, so these tests also cover the "user rejected / wallet failed" path.

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
  await mockRpcWithPool(page);
});

test.describe("Create pool transaction", () => {
  test("sends exact lamports and the UTF-8 name, and survives a refused signature", async ({
    page,
  }) => {
    await gotoReady(page, "/pools/create");
    await connectMockWallet(page);

    // 7 ASCII + 4 x 4-byte emoji = 23 bytes, then more emoji that would pass 32 bytes
    const name = page.getByPlaceholder("Family circle");
    await name.fill("Arisan 🎉🎉🎉🎉🎉🎉🎉");
    const kept = await name.inputValue();
    expect(new TextEncoder().encode(kept).length).toBeLessThanOrEqual(32);
    expect(kept).toBe("Arisan 🎉🎉🎉🎉🎉🎉"); // 7 + 24 = 31 bytes; a 7th emoji would be 35

    // Math.floor(4.1 * 1e9) is 4099999999: one lamport short (E2E-8)
    await page.getByPlaceholder("0.5").fill("4.1");
    await page.getByRole("button", { name: "More members" }).click(); // 6
    await page.getByRole("button", { name: "2×", exact: true }).click();

    await page.getByRole("button", { name: "Create pool" }).click();
    await expect(page.getByText("Transaction Failed")).toBeVisible();

    // The form is intact and can be retried
    await expect(name).toHaveValue(kept);
    await expect(page.getByPlaceholder("0.5")).toHaveValue("4.1");
    await expect(page.getByRole("button", { name: "Create pool" })).toBeEnabled();

    const ixs = await signRequests(page);
    expect(ixs).toHaveLength(1);
    const ix = ixs[0]!;
    expect(ix.name).toMatch(/^create_?[pP]ool$/);
    const args = ix.data as Record<string, unknown>;
    const get = (snake: string, camel: string) => args[snake] ?? args[camel];
    expect(get("name", "name")).toBe(kept);
    expect(String(get("contribution_amount", "contributionAmount"))).toBe("4100000000");
    expect(get("max_members", "maxMembers")).toBe(6);
    expect(get("stake_multiplier", "stakeMultiplier")).toBe(2);
    expect(get("stake_enabled", "stakeEnabled")).toBe(true);
  });

  test("amount input keeps one decimal point and at most 9 decimals (E2E-8)", async ({ page }) => {
    await gotoReady(page, "/pools/create");
    const amount = page.getByPlaceholder("0.5");
    await amount.fill("1.2.3");
    await expect(amount).toHaveValue("1.23");
    await amount.fill("0.12345678912345");
    await expect(amount).toHaveValue("0.123456789");
  });

  test("an amount below one lamport cannot be submitted", async ({ page }) => {
    await gotoReady(page, "/pools/create");
    await connectMockWallet(page);
    await page.getByPlaceholder("Family circle").fill("Tiny");
    await page.getByPlaceholder("0.5").fill("0.0000000001");
    await expect(page.getByPlaceholder("0.5")).toHaveValue("0.000000000");
    await expect(page.getByRole("button", { name: "Create pool" })).toBeDisabled();
    expect(await signRequests(page)).toHaveLength(0);
  });
});

test.describe("Join pool transaction", () => {
  test("sends the typed invite code for the found pool and survives a refused signature", async ({
    page,
  }) => {
    await gotoReady(page, "/join");
    await connectMockWallet(page);
    await page.getByPlaceholder("ABCD1234").fill(MOCK_POOL.inviteCode.toLowerCase());
    await page.getByRole("button", { name: "Find pool" }).click();
    await page.getByRole("button", { name: "Join pool" }).click();
    await expect(page.getByText("Transaction Failed")).toBeVisible();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole("button", { name: "Join pool" })).toBeEnabled();

    const ixs = await signRequests(page);
    expect(ixs).toHaveLength(1);
    expect(ixs[0]!.name).toMatch(/^join_?[pP]ool$/);
    const args = ixs[0]!.data as Record<string, unknown>;
    expect(args.invite_code ?? args.inviteCode).toBe(MOCK_POOL.inviteCode);
  });
});
