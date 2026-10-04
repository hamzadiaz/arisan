import { test, expect } from "@playwright/test";
import { MOCK_POOL, gotoReady, mockRpcWithPool } from "./helpers";

// The Bezel dial and the circle screen's tabs.

test.describe("Dial", () => {
  // Whether a machine gets 3D depends on its GPU. Headless Chromium renders WebGL with
  // SwiftShader on the CPU and passes the performance-caveat check, so the probe also reads
  // the renderer name. The query flags pin each path regardless of the host.
  test("software WebGL (SwiftShader) keeps the SVG dial", async ({ page }) => {
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    });
    test.skip(!/swiftshader/i.test(renderer), `this browser renders WebGL on ${renderer || "nothing"}`);
    await gotoReady(page, "/");
    const dial = page.locator("main [data-dial]");
    await page.waitForTimeout(1_500);
    await expect(dial).toHaveAttribute("data-dial", "svg");
    await expect(dial.locator("canvas")).toHaveCount(0);
  });

  test("?dial=svg keeps the SVG dial", async ({ page }) => {
    await gotoReady(page, "/?dial=svg");
    const dial = page.locator("main [data-dial]");
    await page.waitForTimeout(1_500);
    await expect(dial).toHaveAttribute("data-dial", "svg");
    await expect(dial.locator("svg").first()).toBeVisible();
    await expect(dial.locator("canvas")).toHaveCount(0);
  });

  test("?dial=3d forces the Three.js dial and it draws", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoReady(page, "/?dial=3d");
    const dial = page.locator("main [data-dial]");
    await expect(dial).toHaveAttribute("data-dial", "webgl", { timeout: 30_000 });
    await expect(dial.locator("canvas")).toHaveCount(1);
  });
});

test("the History tab reads from what the page already loaded (3 program reads)", async ({ page }) => {
  await mockRpcWithPool(page);
  const methods: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http://127.0.0.1:8899")) methods.push(r.postDataJSON()?.method);
  });
  await gotoReady(page, `/pools/${MOCK_POOL.address.toBase58()}`);
  await expect(page.locator("header h1")).toHaveText(MOCK_POOL.name);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("took the pot")).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(methods.filter((m) => m === "getProgramAccounts")).toHaveLength(3);
});
