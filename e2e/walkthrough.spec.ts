import { test, expect, type Page } from "@playwright/test";
import { expectNoForbiddenCopy, gotoReady } from "./helpers";

// First visit shows a four-screen walkthrough over Home, told on the app's own dial. Skip or
// finish stores arisan.walkthrough.v1 and it never shows again.

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
  await expect(walkthrough(page).getByText("Nothing moves until you approve.")).toBeVisible();
  await expect(walkthrough(page)).not.toContainText(/keys/i);
});

test("keys move through it: arrows step, Escape skips, Tab stays inside", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(walkthrough(page)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(walkthrough(page).getByRole("heading", { name: TITLES[1] })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(walkthrough(page).getByRole("heading", { name: TITLES[0] })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(walkthrough(page).getByRole("button", { name: "Skip" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(walkthrough(page).getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(walkthrough(page).getByRole("button", { name: "Skip" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(walkthrough(page).getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(walkthrough(page)).toBeHidden();
  expect(await stored(page)).not.toBeNull();
});

const scene = (page: Page) => walkthrough(page).getByTestId("walkthrough-scene");
const LAST_STEP = ["6", "6", "1", "1"];

test("each beat plays on the app's own dial, never remounted between beats", async ({ page }) => {
  await gotoReady(page, "/");
  const dial = scene(page).locator("[data-dial]");
  await expect(dial).toHaveCount(1);
  const handle = await dial.elementHandle();
  for (let beat = 0; beat < 4; beat++) {
    await expect(scene(page)).toHaveAttribute("data-beat", String(beat));
    // Software WebGL (CI) keeps the flat dial, which shows where each beat ends
    if ((await dial.getAttribute("data-dial")) === "svg") await expect(scene(page)).toHaveAttribute("data-step", LAST_STEP[beat]);
    if (beat < 3) await walkthrough(page).getByRole("button", { name: "Next" }).click();
  }
  expect(await handle!.evaluate((d) => d.isConnected)).toBe(true);
});

test("the 3D dial plays each beat, then hands the landing dial a warm engine", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoReady(page, "/?dial=3d");
  const dial = scene(page).locator("[data-dial]");
  await expect(dial).toHaveAttribute("data-dial", "webgl", { timeout: 60_000 });
  // The beat plays step by step once the dial draws
  await expect(scene(page)).toHaveAttribute("data-step", "6", { timeout: 10_000 });
  for (let i = 0; i < 3; i++) await walkthrough(page).getByRole("button", { name: "Next" }).click();
  await expect(scene(page)).toHaveAttribute("data-beat", "3");

  // Under the intro the landing dial waits, its flat SVG hidden: the two never swap in view
  const landing = page.locator("main [data-dial]");
  await expect(landing).toHaveAttribute("data-dial", "auto");
  expect(await landing.locator(".dial-poster").evaluate((p) => getComputedStyle(p).opacity)).toBe("0");
  await landing.evaluate((d) => {
    const seen: string[] = [];
    (window as unknown as { dialModes: string[] }).dialModes = seen;
    new MutationObserver(() => seen.push(d.getAttribute("data-dial") ?? "")).observe(d, { attributes: true, attributeFilter: ["data-dial"] });
  });
  await walkthrough(page).getByRole("button", { name: "Get started" }).click();
  // It draws in 3D straight away, while the intro is still fading out
  await expect(landing).toHaveAttribute("data-dial", "webgl", { timeout: 1_000 });
  await expect(landing).toHaveAttribute("data-instant", "");
  await expect(landing.locator("canvas")).toHaveCount(1);
  await expect(walkthrough(page)).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { dialModes: string[] }).dialModes)).toEqual(["webgl"]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("each beat shows where it ends and stays still", async ({ page }) => {
    await gotoReady(page, "/");
    for (let beat = 0; beat < 2; beat++) {
      await expect(scene(page)).toHaveAttribute("data-beat", String(beat));
      await expect(scene(page)).toHaveAttribute("data-step", LAST_STEP[beat]);
      await page.waitForTimeout(600);
      await expect(scene(page)).toHaveAttribute("data-step", LAST_STEP[beat]);
      await walkthrough(page).getByRole("button", { name: "Next" }).click();
    }
  });
});
