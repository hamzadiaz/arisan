import { test, expect } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";
import { MOCK_POOL, MOCK_WALLET, RPC_URL, gotoReady, installMockWallet, mockRpcWithPool } from "./helpers";

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

  // Signing in swaps Home's dial (loading, then the next circle) while the first shader compile
  // can still be running. That rebuild used to free materials three was still checking: the
  // compile threw, never finished, and Home kept its flat dial for the whole visit.
  test("a signed-in Home reaches the 3D dial when its dial changes mid-compile", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await installMockWallet(page);
    await mockRpcWithPool(page, {
      status: "Active",
      currentRound: 1,
      members: [
        { wallet: new PublicKey(MOCK_WALLET.address), stakeDeposited: true },
        { wallet: new PublicKey("Fr1ends1111111111111111111111111111111111111"), stakeDeposited: true },
      ],
    });
    // Real GPUs compile shaders in the background (KHR_parallel_shader_compile); software GL in CI
    // finishes at once and hides the race. Report the extension and keep programs "compiling" for
    // the first few seconds, as a phone does.
    await page.addInitScript(() => {
      const COMPLETION_STATUS = 0x91b1;
      const loaded = Date.now();
      const gl = WebGL2RenderingContext.prototype;
      const getExtension = gl.getExtension;
      gl.getExtension = function (this: WebGL2RenderingContext, name: string) {
        return name === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR: COMPLETION_STATUS } : getExtension.call(this, name);
      } as typeof gl.getExtension;
      const getProgramParameter = gl.getProgramParameter;
      gl.getProgramParameter = function (this: WebGL2RenderingContext, program: WebGLProgram, pname: number) {
        return pname === COMPLETION_STATUS ? Date.now() - loaded > 6000 : getProgramParameter.call(this, program, pname);
      };
    });
    // A returning user: the wallet reconnects on load, and the circle list takes a moment, as on a
    // real chain: the loading dial starts the compile, then the next circle's dial takes over
    await page.addInitScript((name) => localStorage.setItem("walletName", JSON.stringify(name)), MOCK_WALLET.name);
    await page.route(RPC_URL, async (route) => {
      if (route.request().postDataJSON()?.method === "getProgramAccounts") await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });
    await gotoReady(page, "/?dial=3d");
    await expect(page.getByText("0/2 paid this round")).toBeVisible();
    await expect(page.locator("main [data-dial]")).toHaveAttribute("data-dial", "webgl", { timeout: 90_000 });
    expect(errors).toEqual([]);
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
