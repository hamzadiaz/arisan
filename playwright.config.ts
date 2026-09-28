import { defineConfig, devices } from "@playwright/test";

// A dedicated port so a dev server from another checkout on :3000 is never reused.
const PORT = Number(process.env.E2E_PORT ?? 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Deterministic, offline app env: nothing listens on the RPC URL, so every chain read
// fails closed ("not found") instead of depending on devnet. Secrets are blanked so the
// API tests see the production-safe defaults (custodial off, no cron secret).
const APP_ENV = [
  "NEXT_TELEMETRY_DISABLED=1",
  "NEXT_DIST_DIR=.next-e2e",
  "NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899",
  "NEXT_PUBLIC_SOLANA_NETWORK=devnet",
  "CUSTODIAL_SIGNING_ENABLED=",
  "STRIPE_ONRAMP_ENABLED=",
  "CRON_SECRET=",
  "UPSTASH_REDIS_REST_URL=",
  "UPSTASH_REDIS_REST_TOKEN=",
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Pixel 5"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: `env ${APP_ENV} npx next build && env ${APP_ENV} npx next start -H 127.0.0.1 -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
