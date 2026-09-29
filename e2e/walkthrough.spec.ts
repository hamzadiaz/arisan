import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

// Six different real PNGs, so a test loop has something to change between.
const DISTINCT_PNGS = [
  "public/assets/generated/create-pool.png",
  "public/assets/generated/empty-pools.png",
  "public/assets/generated/join-code.png",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/logo-mark.png",
];
const frameIndex = (url: string) => Number(/-0([1-6])\.png$/.exec(url)?.[1] ?? 1) - 1;
const art = (page: Page) => walkthrough(page).getByTestId("walkthrough-art");

test("scene art cycles six distinct frames", async ({ page }) => {
  await page.route("**/assets/frames/*.png", (route) =>
    route.fulfill({ path: DISTINCT_PNGS[frameIndex(route.request().url())], contentType: "image/png" })
  );
  const requested = new Set<string>();
  page.on("request", (req) => {
    if (req.url().includes("/assets/frames/")) requested.add(new URL(req.url()).pathname);
  });

  await gotoReady(page, "/");
  await expect(art(page)).toHaveAttribute("data-playing", "true");
  await expect(art(page)).toHaveAttribute("data-frame-state", "playing");

  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    seen.add((await art(page).getAttribute("src")) ?? "");
    await page.waitForTimeout(60);
  }
  expect([...seen].every((src) => /\/assets\/frames\/circle-0[1-6]\.png$/.test(src))).toBe(true);
  expect(seen.size).toBeGreaterThan(1);
  expect(requested.size).toBeGreaterThanOrEqual(2);
});

test("identical frames are reported, not played as a frozen loop", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.route("**/assets/frames/*.png", (route) =>
    route.fulfill({ path: "public/icons/logo-mark.png", contentType: "image/png" })
  );

  await gotoReady(page, "/");
  await expect(art(page)).toHaveAttribute("data-frame-state", "duplicate");
  await expect(art(page)).toHaveAttribute("data-playing", "false");
  await expect(art(page)).toHaveAttribute("src", "/assets/generated/walk-circle.png");
  expect(errors.some((e) => e.includes("[FrameCycle]") && e.includes("identical"))).toBe(true);
});

test("a frame that fails to load is reported and keeps the still", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.route("**/assets/frames/*.png", (route) =>
    frameIndex(route.request().url()) === 3
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ path: DISTINCT_PNGS[frameIndex(route.request().url())], contentType: "image/png" })
  );

  await gotoReady(page, "/");
  await expect(art(page)).toHaveAttribute("data-frame-state", "decode-failed");
  await expect(art(page)).toHaveAttribute("data-playing", "false");
  await expect(art(page)).toHaveAttribute("src", "/assets/generated/walk-circle.png");
  expect(errors.some((e) => e.includes("[FrameCycle]"))).toBe(true);
});

// The gate for the shipped art: same check as `npm run check:frames`.
for (const scene of ["circle", "pay", "payout", "wallet"]) {
  test(`shipped ${scene} frames are six distinct images`, () => {
    const hashes = Array.from({ length: 6 }, (_, i) =>
      createHash("sha256")
        .update(readFileSync(`public/assets/frames/${scene}-0${i + 1}.png`))
        .digest("hex")
    );
    expect(new Set(hashes).size, `${scene} frame hashes: ${hashes.map((h) => h.slice(0, 12)).join(" ")}`).toBe(6);
  });
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the still and never cycles", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(art(page)).toHaveAttribute("src", "/assets/generated/walk-circle.png");
    await page.waitForTimeout(500);
    await expect(art(page)).toHaveAttribute("src", "/assets/generated/walk-circle.png");
    await expect(art(page)).toHaveAttribute("data-playing", "false");
    await expect(art(page)).toHaveAttribute("data-frame-state", "reduced-motion");
  });
});
