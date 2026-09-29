import { test, expect, type Page } from "@playwright/test";
import { expectNoForbiddenCopy, gotoReady } from "./helpers";

// First visit shows a four-screen walkthrough over Home. Skip or finish stores
// arisan.walkthrough.v1 and it never shows again.

test.use({ storageState: { cookies: [], origins: [] } });

const KEY = "arisan.walkthrough.v1";
const TITLES = ["Form a circle", "Everyone pays in", "One takes the pot", "Your wallet"];
const walkthrough = (page: Page) => page.getByTestId("walkthrough");
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

test("first visit shows the walkthrough; finishing lands on Home for good", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(walkthrough(page)).toBeVisible();
  await expect(page.getByTestId("walkthrough-dot")).toHaveCount(4);
  await expectNoForbiddenCopy(page);

  for (const [i, title] of TITLES.entries()) {
    await expect(walkthrough(page).getByRole("heading", { name: title })).toBeVisible();
    await expect(walkthrough(page).getByRole("button", { name: "Skip" })).toBeVisible();
    await walkthrough(page).getByRole("button", { name: i === 3 ? "Get started" : "Next" }).click();
  }

  await expect(walkthrough(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  expect(await stored(page)).not.toBeNull();

  await page.reload();
  await expect(page.locator("nav")).toBeVisible();
  await expect(walkthrough(page)).toHaveCount(0);
});

test("Skip closes it on any screen and it stays closed", async ({ page }) => {
  await gotoReady(page, "/join");
  await walkthrough(page).getByRole("button", { name: "Next" }).click();
  await expect(walkthrough(page).getByRole("heading", { name: TITLES[1] })).toBeVisible();
  await walkthrough(page).getByRole("button", { name: "Skip" }).click();

  await expect(walkthrough(page)).toBeHidden();
  expect(await stored(page)).not.toBeNull();
  // The page underneath is usable right away
  await page.getByPlaceholder("ABCD1234").fill("E2ETEST1");

  await gotoReady(page, "/");
  await expect(walkthrough(page)).toHaveCount(0);
});

test("the last screen is about your wallet, never keys", async ({ page }) => {
  await gotoReady(page, "/");
  for (let i = 0; i < 3; i++) await walkthrough(page).getByRole("button", { name: "Next" }).click();
  await expect(walkthrough(page).getByRole("heading", { name: "Your wallet" })).toBeVisible();
  await expect(walkthrough(page).getByText("You sign.")).toBeVisible();
  await expect(walkthrough(page)).not.toContainText(/keys/i);
});

test("scene art cycles its frames once they load", async ({ page }) => {
  // Serve a real PNG for every frame so the loop runs whether or not the art has landed.
  await page.route("**/assets/frames/*.png", (route) =>
    route.fulfill({ path: "public/icons/logo-mark.png", contentType: "image/png" })
  );
  await gotoReady(page, "/");
  const art = walkthrough(page).getByTestId("walkthrough-art");
  await expect(art).toHaveAttribute("data-playing", "true");

  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    seen.add((await art.getAttribute("src")) ?? "");
    await page.waitForTimeout(60);
  }
  expect([...seen].every((src) => /\/assets\/frames\/circle-0[1-6]\.png$/.test(src))).toBe(true);
  expect(seen.size).toBeGreaterThan(1);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the still and never cycles", async ({ page }) => {
    await gotoReady(page, "/");
    const art = walkthrough(page).getByTestId("walkthrough-art");
    await expect(art).toHaveAttribute("src", "/assets/generated/walk-circle.png");
    await page.waitForTimeout(500);
    await expect(art).toHaveAttribute("src", "/assets/generated/walk-circle.png");
    await expect(art).toHaveAttribute("data-playing", "false");
  });
});
