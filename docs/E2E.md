# Arisan E2E — all features (CLOCK IN)

Repo: `hamzadiaz/arisan` · branch for this work: `feat/clockin-e2e`
GitHub user: `hamzadiaz`. One PR. Do not merge.

Read: `docs/CLOCKIN.md`, `docs/SECURITY_FINDINGS.md`, `docs/UI_CLOCKIN.md`.

## Goal

A single, runnable E2E gate that covers **every user-facing and on-chain feature** currently on `main`. No sampled “happy path only.” If a feature exists, it has an automated test.

Add:

- Playwright (UI + API)
- Keep / extend Anchor `security_p0` + a program flow test
- `npm` scripts: `test:e2e`, `test:e2e:ui`, `test:security`
- CI workflow if missing
- Proof in `docs/e2e-proof/` (command output + screenshots)

## Features that MUST have tests

### UI (Playwright, mobile 390×844)

1. Home welcome: “Save together”, Connect wallet, Have an invite code
2. Bottom nav: Home / Create / Join, all three routes distinct
3. Theme toggle: dark → light (html class + background change)
4. Wallet connect sheet opens (copy or wallet list; MWA may be empty on desktop — assert sheet, not a real Seed Vault)
5. Join: invite input, Paste, Find pool
6. Create: name, amount, members, stake 1×/2×/3×, “Connect wallet to create” without wallet
7. Pool detail `/pools/[id]` loads (unknown id = honest empty/error, not crash)
8. No Stripe / custodial / NFT copy in the UI
9. CSS actually applied (not unstyled HTML)
10. Safe-area shell max-width 480px

### API

11. `POST /api/custodial/create-wallet` → 410
12. `POST /api/custodial/sign-transaction` → 410
13. Cron draw without `CRON_SECRET` → 401/403, not 200

### On-chain (Anchor, local validator)

14. Create pool + hashed invite
15. Join with correct code / reject wrong code
16. Deposit stake, start pool, make payment
17. `execute_draw` cannot pay a caller-chosen winner
18. Derived winner is paid `contribution * member_count`
19. Paid member cannot be marked defaulter
20. Unpaid member cannot be defaulted before deadline; can after
21. Invite plaintext not in program logs (return data only)

### Scripts

```bash
npm run test:security   # cargo test -p arisan_contracts --test security_p0
npm run test:e2e:ui     # playwright against next start
npm run test:e2e        # security + ui
```

## Forbidden

- Do not mint NFTs
- Do not re-enable custodial signing
- Do not touch Binance/trading Herdr panes
- Do not force-push or merge
- Do not edit program instructions except tests / IDL consumption unless a test proves a bug — then file it, don’t silently “fix” security again on this branch

## Done when

`gh pr create` from `feat/clockin-e2e` against `main`, CI or local log shows the full matrix above, screenshots in `docs/e2e-proof/`.
