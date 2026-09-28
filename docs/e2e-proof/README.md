# E2E proof — CLOCK IN

Full run: [`test-e2e.log`](test-e2e.log) (`npm run test:e2e`, exit 0).
Screenshots: [`ui/`](ui/), mobile 390×844, dark colour scheme, Chromium.

```bash
npm run test:security   # Anchor: cargo test -p arisan_contracts --test security_p0 (4 tests)
npm run test:e2e:ui     # Playwright UI + API against `next build && next start` (25 tests)
npm run test:e2e        # both
```

## How the gate is isolated

- **Web app**: Playwright builds and starts its own server on port 3107 (`reuseExistingServer: false`, so a dev server on :3000 from another checkout is never tested by mistake).
- **Offline chain**: the app is built with `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899`, where nothing listens. Every chain read fails closed and no test traffic goes to devnet. Tests that need a pool route that URL to a JSON-RPC mock. The mock serves a `Pool` account Borsh-encoded from `src/lib/solana/idl.json`, the same IDL the app decodes with (`e2e/helpers.ts`).
- **Secrets blanked**: `CUSTODIAL_SIGNING_ENABLED`, `CRON_SECRET` and `UPSTASH_*` are set empty for the server, so the API tests exercise production-safe defaults.
- **On-chain**: `solana-program-test` BanksClient (an in-process validator bank, including the `SlotHashes` sysvar and clock warps). It runs the real program entrypoint.

## Matrix

| # | Requirement | Test | Proof |
|---|---|---|---|
| 1 | Home welcome: "Save together", Connect wallet, Have an invite code | `ui.spec.ts` › 1. Home welcome | `ui/01-home-welcome.png` |
| 2 | Bottom nav Home / Create / Join, three distinct routes | › 2. Bottom nav (URL, header title, active state per tab) | `ui/02-bottom-nav.png` |
| 3 | Theme toggle dark → light (html class + background) | › 3. Theme toggle (seeded dark → light, persisted across reload; plus system-dark → light in one tap) | `ui/03a-theme-dark.png`, `ui/03b-theme-light.png` |
| 4 | Wallet connect sheet opens | › 4. Wallet connect sheet (body CTA and header chip; closes) | `ui/04a-wallet-sheet.png`, `ui/04b-…` |
| 5 | Join: invite input, Paste, Find pool | › 5. Join (normalisation, 8-char gate, clipboard Paste, not-found message, found pool → "Connect wallet to join" → sheet) | `ui/05a-join-not-found.png`, `ui/05b-join-found.png` |
| 6 | Create: name, amount, members, stake 1×/2×/3×, "Connect wallet to create" | › 6. Create (32-char cap, numeric filter, 2..20 bounds, pot + stake summary per multiplier, stake off → None, CTA opens sheet) | `ui/06a-create-filled.png`, `ui/06b-…` |
| 7 | `/pools/[id]` loads; unknown id is an honest empty state, not a crash | › 7. Pool detail (mocked pool renders; unknown pubkey → "Pool not found" with no page errors; malformed id → **E2E-1**) | `ui/07a-pool-detail.png`, `ui/07b-pool-not-found.png`, `ui/07c-…` |
| 8 | No Stripe / custodial / NFT copy | › 8. No Stripe / custodial / NFT copy (`body.innerText` on 4 routes + inside the wallet sheet) | — |
| 9 | CSS actually applied | › 9. CSS is applied (stylesheets, `--primary`, body bg, button radius/height/flex, fixed nav). Font: **E2E-2** | — |
| 10 | Safe-area shell max-width 480px | › 10. Safe-area shell (`viewport-fit=cover`, safe-area-inset rules, 390 px at mobile, capped at 480 px on a 1024 px viewport, no horizontal overflow) | `ui/10-shell-480-on-wide-viewport.png` |
| 11 | `POST /api/custodial/create-wallet` → 410 | `api.spec.ts` › 11-12 (also `GET` → 410) | log |
| 12 | `POST /api/custodial/sign-transaction` → 410 | `api.spec.ts` › 11-12 | log |
| 13 | Cron draw without `CRON_SECRET` → 401/403 | `api.spec.ts` › 13 (GET no header, GET `Bearer ` / `Bearer undefined`, POST no secret: all 401) | log |
| 14 | Create pool + hashed invite | `security_p0` › `join_requires_the_hashed_invite_code` (stored hash = SHA-256(code); plaintext not in the account bytes); `program_flow_…` | log |
| 15 | Join with correct code / reject wrong code | `join_requires_the_hashed_invite_code` (wrong code and lowercase variant → `Invalid invite code`, no member PDA created, count unchanged; correct code joins at position 1) | log |
| 16 | Deposit stake, start pool, make payment | `program_flow_create_join_stake_start_pay_draw` (vault deltas for stake and payments, `Active`/round 1, Payment PDAs, `payments_made`) | log |
| 17 | `execute_draw` cannot pay a caller-chosen winner | `malicious_caller_cannot_choose_winner_and_vault_pays_derived_member` (rejected, vault unchanged, roster order ignored) | log |
| 18 | Derived winner paid `contribution * member_count` | the same test, plus `program_flow_…` (stakes stay escrowed after the draw) | log |
| 19 | Paid member cannot be marked defaulter | `paid_member_cannot_be_defaulted_and_unpaid_only_after_deadline` (before and after the deadline) | log |
| 20 | Unpaid member not defaulted before deadline; can after | the same test (stake slashed, `in_default`, grace period) | log |
| 21 | Invite plaintext not in program logs (return data only) | `create_pool` helper, used by every test: the code comes back through return data, is absent from every log line, and is decoded out of `Program data:` event payloads when present | log |

Items 17–21 were already covered by `security_p0` on `main`. This branch keeps them unchanged and adds 14–16 and the stronger log check for 21.

Note on 21: with the native processor that `security_p0` uses, `solana-program-test` prints `sol_log_data` (Anchor events) to stdout and does not record it in `log_messages`. The event decode therefore only engages when the program runs as BPF. `PoolCreated` has no invite field, and the plaintext check covers every recorded log line.

## Findings (filed, not fixed on this branch)

Both findings are encoded as `test.fail()`. They show as `✘` in the log while the suite still passes. When someone fixes the bug, the test starts passing, Playwright reports "expected to fail but passed", and the `test.fail()` line must be removed.

- **E2E-1: malformed pool id loads forever.** `/pools/not-a-pool` never leaves the skeleton. `useSolanaPoolData().getPool` calls `new PublicKey(poolAddress)` outside `fetchPool`'s try/catch. The rejection escapes `Promise.all` in the page's `fetchData`, and `data` is never set. A well-formed unknown address correctly shows "Pool not found". Proof: `ui/07c-pool-malformed-id-after-8s.png`. Fix: catch in `getPool` (or validate the id) and return `null`.
- **E2E-2: Geist is not the rendered font.** `globals.css` has `@theme inline { --font-sans: var(--font-geist-sans) }`, which resolves on `<html>`. `next/font` defines `--font-geist-sans` on `<body>`, so text falls back to `ui-sans-serif`. Fix: put the font variable classes on `<html>`.
