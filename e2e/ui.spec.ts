import { test, expect } from "@playwright/test";
import {
  MOCK_POOL,
  expectNoForbiddenCopy,
  gotoReady,
  mockRpcWithPool,
  openWalletSheet,
  proof,
  walletSheet,
} from "./helpers";

// Mobile 390x844, dark colour scheme, no wallet extension, offline RPC (see playwright.config.ts).

const nav = (page: import("@playwright/test").Page) => page.locator("nav");

test.describe("1. Home welcome", () => {
  test("shows Save together, Connect wallet and the invite link", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { name: /Save together\.\s*Take turns\./ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
    const invite = page.getByRole("link", { name: "Have an invite code?" });
    await expect(invite).toBeVisible();
    await expect(invite).toHaveAttribute("href", "/join");
    await proof(page, "01-home-welcome");

    await invite.click();
    await expect(page).toHaveURL(/\/join$/);
  });
});

test.describe("2. Bottom nav", () => {
  test("Home / Create / Join go to three distinct routes", async ({ page }) => {
    await gotoReady(page, "/");
    const tabs = [
      { label: "Home", path: "/", title: "Arisan" },
      { label: "Create", path: "/pools/create", title: "New pool" },
      { label: "Join", path: "/join", title: "Join a pool" },
    ];
    await expect(nav(page).getByRole("link")).toHaveCount(3);

    const seen = new Set<string>();
    for (const tab of [...tabs.slice(1), tabs[0]]) {
      await nav(page).getByRole("link", { name: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path.replace(/\//g, "\\/")}$`));
      await expect(page.locator("header h1")).toHaveText(tab.title);
      await expect(nav(page).getByRole("link", { name: tab.label })).toHaveClass(/text-primary/);
      for (const other of tabs.filter((t) => t.label !== tab.label)) {
        await expect(nav(page).getByRole("link", { name: other.label })).toHaveClass(
          /text-muted-foreground/
        );
      }
      seen.add(new URL(page.url()).pathname);
      await proof(page, `02-nav-${tab.label.toLowerCase()}`);
    }
    expect([...seen].sort()).toEqual(["/", "/join", "/pools/create"]);
  });
});

test.describe("3. Theme toggle", () => {
  test("dark -> light changes the html class and the background", async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("e2e-seeded")) {
        localStorage.setItem("theme", "dark");
        sessionStorage.setItem("e2e-seeded", "1");
      }
    });
    await gotoReady(page, "/");
    const html = page.locator("html");
    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await expect(html).toHaveClass(/\bdark\b/);
    const darkBg = await bodyBg();
    await proof(page, "03a-theme-dark");

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(html).toHaveClass(/\blight\b/);
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect.poll(bodyBg).not.toBe(darkBg);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    await proof(page, "03b-theme-light");

    // Persisted across reloads
    await page.reload();
    await expect(html).toHaveClass(/\blight\b/);
  });

  test("one tap from system-dark switches to light", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
  });
});

test.describe("4. Wallet connect sheet", () => {
  test("Connect wallet opens the wallet sheet", async ({ page }) => {
    await gotoReady(page, "/");
    await openWalletSheet(page, () => page.getByRole("button", { name: "Connect wallet" }).click());
    const sheet = walletSheet(page);
    await expect(sheet).toContainText("Connect a wallet on Solana to continue");
    // Desktop Chromium has no Seed Vault; the sheet lists what it detects (MWA may be present or empty).
    await proof(page, "04a-wallet-sheet");
    await expectNoForbiddenCopy(page);

    await sheet.locator(".wallet-adapter-modal-button-close").click();
    await expect(sheet).toBeHidden();
  });

  test("header Connect chip opens the same sheet", async ({ page }) => {
    await gotoReady(page, "/join");
    await openWalletSheet(page, () =>
      page.locator("header").getByRole("button", { name: "Connect" }).click()
    );
    await expect(walletSheet(page)).toContainText("Connect a wallet on Solana to continue");
    await proof(page, "04b-wallet-sheet-from-header");
  });
});

test.describe("5. Join", () => {
  test("invite input normalises, Paste fills it, Find pool reports no match", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/join");
    const input = page.getByPlaceholder("ABCD1234");
    const find = page.getByRole("button", { name: "Find pool" });

    await expect(input).toBeVisible();
    await expect(find).toBeDisabled();

    await input.fill("ab-cd 12");
    await expect(input).toHaveValue("ABCD12");
    await expect(find).toBeDisabled();
    await input.fill("zzzz9999extra");
    await expect(input).toHaveValue("ZZZZ9999");
    await expect(find).toBeEnabled();

    await input.fill("");
    await page.evaluate(() => navigator.clipboard.writeText(" qwer-7890 "));
    await page.getByRole("button", { name: "Paste" }).click();
    await expect(input).toHaveValue("QWER7890");

    await find.click();
    await expect(page.getByText("No pool matches that code. Check it and try again.")).toBeVisible();
    await proof(page, "05a-join-not-found");
  });

  test("Find pool shows a matching pool and asks to connect before joining", async ({ page }) => {
    await mockRpcWithPool(page);
    await gotoReady(page, "/join");
    await page.getByPlaceholder("ABCD1234").fill(MOCK_POOL.inviteCode.toLowerCase());
    await page.getByRole("button", { name: "Find pool" }).click();

    await expect(page.getByText(MOCK_POOL.name)).toBeVisible();
    await expect(page.getByText("Filling")).toBeVisible();
    await expect(page.getByText("0.5 SOL", { exact: true })).toBeVisible();
    await expect(page.getByText("2.5 SOL")).toBeVisible(); // pot = 0.5 * 5
    await expect(page.getByText("Required")).toBeVisible(); // stake
    const joinBtn = page.getByRole("button", { name: "Connect wallet to join" });
    await expect(joinBtn).toBeEnabled();
    await proof(page, "05b-join-found");

    await openWalletSheet(page, () => joinBtn.click());
  });
});

test.describe("6. Create", () => {
  test("name, amount, members, stake 1x/2x/3x, and Connect wallet to create", async ({ page }) => {
    await gotoReady(page, "/pools/create");
    const summary = (label: string) =>
      page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");

    const name = page.getByPlaceholder("Family circle");
    await name.fill("x".repeat(40));
    await expect(name).toHaveValue("x".repeat(32));
    await name.fill("Office lunch club");

    const amount = page.getByPlaceholder("0.5");
    await amount.fill("abc0.25sol");
    await expect(amount).toHaveValue("0.25");

    // Members: default 5, bounded to 2..20
    const fewer = page.getByRole("button", { name: "Fewer members" });
    const more = page.getByRole("button", { name: "More members" });
    await expect(page.getByText("5 rounds")).toBeVisible();
    await more.click();
    await expect(page.getByText("6 rounds")).toBeVisible();
    for (let i = 0; i < 6; i++) if (await fewer.isEnabled()) await fewer.click();
    await expect(page.getByText("2 rounds")).toBeVisible();
    await expect(fewer).toBeDisabled();
    await more.click();
    await more.click();
    await expect(page.getByText("4 rounds")).toBeVisible();
    await expect(summary("Pot each round")).toHaveText("1 SOL");

    // Stake multiplier
    for (const [label, expected] of [
      ["1× round", "0.25 SOL"],
      ["2× round", "0.5 SOL"],
      ["3× round", "0.75 SOL"],
    ] as const) {
      const btn = page.getByRole("button", { name: label });
      await btn.click();
      await expect(btn).toHaveClass(/border-primary/);
      await expect(summary("Stake per member")).toHaveText(expected);
    }
    await proof(page, "06a-create-filled");

    await page.getByText("Require a stake").click();
    await expect(summary("Stake per member")).toHaveText("None");
    await expect(page.getByRole("button", { name: "1× round" })).toHaveCount(0);
    await page.getByText("Require a stake").click();
    await expect(page.getByRole("button", { name: "3× round" })).toBeVisible();

    const submit = page.getByRole("button", { name: "Connect wallet to create" });
    await expect(submit).toBeEnabled();
    await openWalletSheet(page, () => submit.click());
    await proof(page, "06b-create-connect-sheet");
  });
});

test.describe("7. Pool detail", () => {
  test("a pool account renders its detail page", async ({ page }) => {
    await mockRpcWithPool(page);
    await gotoReady(page, `/pools/${MOCK_POOL.address.toBase58()}`);
    await expect(page.locator("header h1")).toHaveText(MOCK_POOL.name);
    await expect(page.getByText("2.5 SOL", { exact: true })).toBeVisible(); // pot
    await expect(page.getByText("0.5 SOL / round")).toBeVisible();
    await expect(page.getByText(/joined$/)).toBeVisible();
    await proof(page, "07a-pool-detail");
  });

  test("an unknown pool address shows an honest not-found state", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await gotoReady(page, "/pools/11111111111111111111111111111112");
    await expect(page.getByText("Pool not found")).toBeVisible();
    await expect(page.getByText("Check the link and your network.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    expect(errors).toEqual([]);
    await proof(page, "07b-pool-not-found");
  });

  test("a malformed pool id shows not-found instead of loading forever", async ({ page }) => {
    // FINDING E2E-1: getPool() builds `new PublicKey(id)` outside fetchPool's try/catch, so
    // the rejected promise leaves the skeleton up forever. Expected to fail until fixed;
    // remove test.fail() once the page renders "Pool not found" for malformed ids.
    test.fail(true, "E2E-1: /pools/<malformed-id> never leaves the loading skeleton");
    await gotoReady(page, "/pools/not-a-pool");
    // The unknown-pubkey case resolves in ~1s; give this one 8s, then capture what users see.
    await page.waitForTimeout(8_000);
    await proof(page, "07c-pool-malformed-id-after-8s");
    await expect(page.getByText("Pool not found")).toBeVisible({ timeout: 1_000 });
  });
});

test.describe("8. No Stripe / custodial / NFT copy", () => {
  for (const route of ["/", "/join", "/pools/create", "/pools/11111111111111111111111111111112"]) {
    test(`clean copy on ${route}`, async ({ page }) => {
      await gotoReady(page, route);
      await page.waitForTimeout(500);
      await expectNoForbiddenCopy(page);
      await expect(page.locator('a[href*="stripe"], form[action*="stripe"]')).toHaveCount(0);
      await expect(page.locator("text=/buy with card/i")).toHaveCount(0);
    });
  }
});

test.describe("9. CSS is applied", () => {
  test("Tailwind styles, theme tokens and fonts are in effect", async ({ page }) => {
    await gotoReady(page, "/");
    const styles = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Connect wallet")
      )!;
      const b = getComputedStyle(btn);
      const body = getComputedStyle(document.body);
      const navEl = getComputedStyle(document.querySelector("nav")!);
      return {
        sheets: document.styleSheets.length,
        primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
        bodyBg: body.backgroundColor,
        bodyFont: body.fontFamily,
        btnBg: b.backgroundColor,
        btnRadius: parseFloat(b.borderTopLeftRadius),
        btnHeight: btn.getBoundingClientRect().height,
        btnDisplay: b.display,
        navPosition: navEl.position,
        navBottom: navEl.bottom,
      };
    });
    expect(styles.sheets).toBeGreaterThan(0);
    expect(styles.primary).not.toBe("");
    expect(styles.bodyBg).not.toMatch(/^rgba\(0, 0, 0, 0\)$|^rgb\(255, 255, 255\)$/);
    // Tailwind's sans stack, not the UA default serif
    expect(styles.bodyFont).toMatch(/sans/);
    expect(styles.bodyFont.toLowerCase()).not.toMatch(/^"?times/);
    expect(styles.btnBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.btnBg).not.toBe("rgb(239, 239, 239)"); // UA default button grey
    expect(styles.btnRadius).toBeGreaterThanOrEqual(12);
    expect(styles.btnHeight).toBe(56); // h-14
    expect(styles.btnDisplay).toBe("flex");
    expect(styles.navPosition).toBe("fixed");
    expect(styles.navBottom).toBe("0px");
  });
});

test("9b. Geist is the rendered sans font", async ({ page }) => {
  // FINDING E2E-2: `@theme inline { --font-sans: var(--font-geist-sans) }` is resolved on
  // <html>, but next/font defines --font-geist-sans on <body>, so text falls back to
  // ui-sans-serif. Remove test.fail() once body text renders in Geist.
  test.fail(true, "E2E-2: Geist font variable is out of scope where --font-sans resolves");
  await gotoReady(page, "/");
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font.toLowerCase()).toContain("geist");
});

test.describe("10. Safe-area shell", () => {
  test("shell is capped at 480px and pads for safe areas", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/
    );

    const shell = page.locator("header").locator("xpath=..");
    const check = () =>
      page.evaluate(() => {
        const header = document.querySelector("header")!;
        const shellEl = header.parentElement!;
        const navEl = document.querySelector("nav")!;
        const rules = [...document.styleSheets]
          .flatMap((s) => {
            try {
              return [...s.cssRules].map((r) => r.cssText);
            } catch {
              return [];
            }
          })
          .join("\n");
        return {
          shellMax: getComputedStyle(shellEl).maxWidth,
          shellWidth: shellEl.getBoundingClientRect().width,
          navMax: getComputedStyle(navEl).maxWidth,
          navWidth: navEl.getBoundingClientRect().width,
          top: rules.includes("safe-area-inset-top"),
          bottom: rules.includes("safe-area-inset-bottom"),
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
        };
      });

    let m = await check();
    expect(m.shellMax).toBe("480px");
    expect(m.navMax).toBe("480px");
    expect(m.shellWidth).toBe(390);
    expect(m.top && m.bottom).toBe(true);
    expect(m.overflowX).toBe(false);

    await page.setViewportSize({ width: 1024, height: 844 });
    await expect(shell).toBeVisible();
    m = await check();
    expect(m.shellWidth).toBe(480);
    expect(m.navWidth).toBe(480);
    await proof(page, "10-shell-480-on-wide-viewport");
  });
});
