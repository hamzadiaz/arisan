import { test, expect, type Page } from "@playwright/test";
import {
  MOCK_POOL,
  MOCK_WALLET_SHORT,
  connectMockWallet,
  gotoReady,
  installMockWallet,
  mockRpcWithPool,
  openWalletSheet,
  proof,
  walletSheet,
} from "./helpers";

// DELIVERY_LOOP.md › Header: self-contained on every route. Brand on Home, Back only on
// nested screens, identity always shown (Connect or wallet chip), theme always works,
// and no tap is a no-op.

const ROUTES = [
  { path: "/", title: "Arisan", nested: false, slug: "home" },
  { path: "/pools/create", title: "New pool", nested: true, slug: "create" },
  { path: "/join", title: "Join a pool", nested: true, slug: "join" },
  { path: `/pools/${MOCK_POOL.address.toBase58()}`, title: MOCK_POOL.name, nested: true, slug: "pool" },
  { path: "/pools/11111111111111111111111111111112", title: "Pool", nested: true, slug: "pool-missing" },
  { path: "/pools/not-a-pool", title: "Pool", nested: true, slug: "pool-malformed" },
  { path: "/does-not-exist", title: "Not found", nested: true, slug: "404" },
];

const header = (page: Page) => page.locator("header");
const connectChip = (page: Page) => header(page).getByRole("button", { name: "Connect", exact: true });

test.describe("Header on every route (disconnected)", () => {
  for (const route of ROUTES) {
    test(`${route.path}: brand/back, title, Connect and theme all work`, async ({ page }) => {
      await mockRpcWithPool(page);
      await gotoReady(page, route.path);

      await expect(header(page)).toBeVisible();
      await expect(header(page).locator("h1")).toHaveText(route.title);
      if (route.nested) {
        await expect(header(page).getByRole("button", { name: "Back" })).toBeVisible();
      } else {
        await expect(header(page).getByRole("link").locator("img")).toBeVisible();
        await expect(header(page).getByRole("button", { name: "Back" })).toHaveCount(0);
      }

      // Identity: the obvious next action is Connect, and it opens the sheet
      await expect(connectChip(page)).toBeVisible();
      await openWalletSheet(page, () => connectChip(page).click());
      await walletSheet(page).locator(".wallet-adapter-modal-button-close").click();
      await expect(walletSheet(page)).toBeHidden();

      // Theme works regardless of page state
      const html = page.locator("html");
      const wasDark = ((await html.getAttribute("class")) ?? "").includes("dark");
      await header(page).getByRole("button", { name: "Toggle theme" }).click();
      await expect(html).toHaveClass(wasDark ? /\blight\b/ : /\bdark\b/);
      await header(page).getByRole("button", { name: "Toggle theme" }).click();
      await expect(html).toHaveClass(wasDark ? /\bdark\b/ : /\blight\b/);

      await proof(page, `h-${route.slug}`);
    });
  }

  test("header stays on screen while scrolling", async ({ page }) => {
    await gotoReady(page, "/pools/create");
    await page.mouse.wheel(0, 2_000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const box = await header(page).boundingBox();
    expect(box?.y).toBe(0);
    await expect(connectChip(page)).toBeInViewport();
  });

  test("Back from a deep link goes Home instead of leaving the app", async ({ page }) => {
    await page.goto("about:blank");
    await gotoReady(page, "/join");
    await header(page).getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(page.getByText("Save together.")).toBeVisible();
  });

  test("Back after in-app navigation returns to the previous screen", async ({ page }) => {
    await gotoReady(page, "/pools/create");
    await page.locator("nav").getByRole("link", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/join$/);
    await header(page).getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/pools\/create$/);
  });
});

test.describe("Header with a connected wallet", () => {
  test("chip shows the wallet on every route and survives reload", async ({ page }) => {
    await installMockWallet(page);
    await mockRpcWithPool(page);
    await gotoReady(page, "/");
    await connectMockWallet(page);
    await proof(page, "h-connected-home");

    // Home switches from the welcome screen to "My pools"
    await expect(page.getByText("Save together.")).toHaveCount(0);
    await expect(page.getByText("No pools yet")).toBeVisible();

    for (const route of ROUTES.slice(1)) {
      await gotoReady(page, route.path);
      await expect(header(page).locator("h1")).toHaveText(route.title);
      await expect(header(page).getByText(MOCK_WALLET_SHORT)).toBeVisible();
      await expect(connectChip(page)).toHaveCount(0);
    }
    await proof(page, "h-connected-404");

    // Pages ask for the next action, not for a connection
    await gotoReady(page, "/pools/create");
    await expect(page.getByRole("button", { name: "Create pool" })).toBeVisible();

    // Chip disconnects
    await header(page).getByRole("button", { name: "Disconnect wallet" }).click();
    await expect(connectChip(page)).toBeVisible();
  });

  test("home shows an honest error when pools can't be loaded", async ({ page }) => {
    await installMockWallet(page);
    await gotoReady(page, "/");
    await connectMockWallet(page);
    await expect(page.getByText("Can't reach Solana")).toBeVisible();
    await expect(page.getByText("No pools yet")).toHaveCount(0);

    await mockRpcWithPool(page);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("No pools yet")).toBeVisible();
  });
});
