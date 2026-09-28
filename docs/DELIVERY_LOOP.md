# Delivery loop — Hamza 2026-09-28

You are the **lead** on Arisan CLOCK IN. Be **proactive and independent**. Do not wait for the next chat ping.

Authorized: **test → find bugs → fix → PR → merge → repeat** until delivery-ready.

GitHub: `hamzadiaz/arisan`. User `hamzadiaz`. Merge with `gh pr merge --merge` after CI green. No force-push.

## Header (product)

Make the **app header self-contained and independent**:

- Always visible on every screen (Home / Create / Join / pool detail)
- Always shows identity: connect CTA if disconnected, wallet chip if connected
- Theme toggle always works without depending on page state
- Back only on nested screens; Home never loses the brand/icon
- Taps never no-op; no header that is just a title bar waiting for the page
- Proactive: if wallet missing, header connect is the obvious next action

## Bugs already found (fix these first)

- **E2E-1** `/pools/<malformed id>` loads forever — must fail honestly
- **E2E-2** Geist font not applied — heading/body must use the intended font

Then keep hunting. Add a regression test for every bug you fix.

## Delivery bar (CLOCK IN)

Not done until:

1. `npm run test:e2e` (or the CI jobs) green on `main`
2. Header independent on all routes (Playwright)
3. E2E-1 and E2E-2 gone
4. No Stripe/custodial/NFT in the demo path
5. Security P0s still green
6. Honest remaining gaps listed (APK/webshell, funded-wallet draw) — do not fake those

If you finish a PR, merge it when CI is green, pull `main`, keep going.
