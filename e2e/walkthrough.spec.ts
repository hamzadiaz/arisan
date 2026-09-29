import { test, expect, type Page } from "@playwright/test";
import { expectNoForbiddenCopy, gotoReady } from "./helpers";

// First visit shows a four-screen walkthrough over Home. Skip or finish stores
// arisan.walkthrough.v1 and it never shows again.

test.use({ storageState: { cookies: [], origins: [] } });

const KEY = "arisan.walkthrough.v1";
const TITLES = ["Together", "Pay in", "Jackpot", "Your wallet"];
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
  await expect(walkthrough(page).getByText("You approve.")).toBeVisible();
  await expect(walkthrough(page)).not.toContainText(/keys/i);
});

const scene = (page: Page) => walkthrough(page).getByTestId("walkthrough-scene");
const snapshot = (page: Page) =>
  scene(page).evaluate((c: HTMLCanvasElement) => ({ frame: c.dataset.frame, pixels: c.toDataURL() }));

/** Count of lit (non-transparent) pixels in the middle of the scene. */
const litPixels = (page: Page) =>
  scene(page).evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    const { data } = ctx.getImageData(c.width / 4, c.height / 5, c.width / 2, c.height / 2);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) lit++;
    return lit;
  });

test("the scene is a full-screen canvas that is already moving within a second", async ({ page }) => {
  await gotoReady(page, "/");
  const canvas = scene(page);
  await expect(canvas).toHaveAttribute("data-playing", "true");

  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height);
  expect(await litPixels(page)).toBeGreaterThan(1000);

  const a = await snapshot(page);
  await page.waitForTimeout(300);
  const b = await snapshot(page);
  expect(b.frame).not.toBe(a.frame);
  expect(b.pixels).not.toBe(a.pixels);
});

test("each beat tells its part of the story on the same canvas", async ({ page }) => {
  await gotoReady(page, "/");
  const canvas = scene(page);
  const handle = await canvas.elementHandle();
  for (let beat = 0; beat < 4; beat++) {
    await expect(canvas).toHaveAttribute("data-beat", String(beat));
    const a = await snapshot(page);
    await page.waitForTimeout(250);
    expect((await snapshot(page)).pixels).not.toBe(a.pixels);
    if (beat < 3) await walkthrough(page).getByRole("button", { name: "Next" }).click();
  }
  // One canvas for the whole intro, never remounted between beats.
  expect(await handle!.evaluate((c) => c.isConnected)).toBe(true);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("draws a still scene and never loops", async ({ page }) => {
    await gotoReady(page, "/");
    const canvas = scene(page);
    await expect(canvas).toHaveAttribute("data-playing", "false");
    await expect(canvas).toHaveAttribute("data-frame", "still");
    expect(await litPixels(page)).toBeGreaterThan(1000);

    const a = await snapshot(page);
    await page.waitForTimeout(500);
    expect((await snapshot(page)).pixels).toBe(a.pixels);

    // Moving on redraws the next beat's settled pose, still without looping.
    await walkthrough(page).getByRole("button", { name: "Next" }).click();
    await expect(canvas).toHaveAttribute("data-beat", "1");
    await expect(canvas).toHaveAttribute("data-playing", "false");
  });
});
