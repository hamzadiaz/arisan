import { test, expect } from "@playwright/test";

// The webServer runs with CUSTODIAL_SIGNING_ENABLED and CRON_SECRET blank (playwright.config.ts).
// The cron route has an in-memory 6 req/min/IP limiter (7th request -> 429). These tests make 4
// cron requests; with CI's retries: 1 a retry adds at most 2. Do not add more cron requests here.

test.describe("11-12. Custodial endpoints are gone", () => {
  for (const endpoint of ["/api/custodial/create-wallet", "/api/custodial/sign-transaction"]) {
    test(`POST ${endpoint} -> 410`, async ({ request }) => {
      const res = await request.post(endpoint, {
        headers: { Authorization: "Bearer any-token" },
        data: { transaction: "AA==" },
      });
      expect(res.status()).toBe(410);
      expect((await res.json()).error).toMatch(/self-custodial/i);
    });
  }

  test("GET /api/custodial/create-wallet -> 410", async ({ request }) => {
    const res = await request.get("/api/custodial/create-wallet");
    expect(res.status()).toBe(410);
  });
});

test.describe("13. Cron draw requires CRON_SECRET", () => {
  const denied = (status: number) => {
    expect(status).not.toBe(200);
    expect([401, 403]).toContain(status);
  };

  test("GET without Authorization is rejected", async ({ request }) => {
    denied((await request.get("/api/cron/draw")).status());
  });

  test("GET with a guessed bearer is rejected (blank secret never matches)", async ({ request }) => {
    denied(
      (await request.get("/api/cron/draw", { headers: { Authorization: "Bearer " } })).status()
    );
    denied(
      (await request.get("/api/cron/draw", { headers: { Authorization: "Bearer undefined" } }))
        .status()
    );
  });

  test("POST without a secret is rejected", async ({ request }) => {
    denied((await request.post("/api/cron/draw", { data: {} })).status());
  });
});
