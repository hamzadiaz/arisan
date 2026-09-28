# E2E proof — CLOCK IN

Full run: [`test-e2e.log`](test-e2e.log) (`npm run test:e2e`, exit 0).
Screenshots: [`ui/`](ui/), mobile 390×844, dark colour scheme, Chromium.

```bash
npm run test:security   # Anchor: cargo test -p arisan_contracts --test security_p0 (4 tests)
npm run test:e2e:ui     # Playwright UI + API + header against `next build && next start` (40 tests)
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
| 2 | Bottom nav Home / Create / Join, three distinct routes | › 2. Bottom nav (URL, header title, active state per tab) | `ui/02-nav-create.png`, `ui/02-nav-join.png`, `ui/02-nav-home.png` |
| 3 | Theme toggle dark → light (html class + background) | › 3. Theme toggle (seeded dark → light, persisted across reload; plus system-dark → light in one tap) | `ui/03a-theme-dark.png`, `ui/03b-theme-light.png` |
| 4 | Wallet connect sheet opens | › 4. Wallet connect sheet (body CTA and header chip; closes) | `ui/04a-wallet-sheet.png`, `ui/04b-…` |
| 5 | Join: invite input, Paste, Find pool | › 5. Join (normalisation, 8-char gate, clipboard Paste; unreachable RPC → "Can't reach Solana"; wrong code → no match; found pool → "Connect wallet to join" → sheet) | `ui/05a-join-network-error.png`, `ui/05b-join-found.png`, `ui/05c-join-no-match.png` |
| 6 | Create: name, amount, members, stake 1×/2×/3×, "Connect wallet to create" | › 6. Create (32-char cap, numeric filter, 2..20 bounds, pot + stake summary per multiplier, stake off → None, CTA opens sheet) | `ui/06a-create-filled.png`, `ui/06b-…` |
| 7 | `/pools/[id]` loads; unknown id is an honest empty state, not a crash | › 7. Pool detail (mocked pool renders; unknown pubkey and malformed id → "Pool not found" with no page errors; unreachable RPC → "Can't reach Solana" + working Try again; data loaded once) | `ui/07a-pool-detail.png`, `ui/07b-pool-not-found.png`, `ui/07c-pool-malformed-id.png`, `ui/07d-pool-network-error.png` |
| 8 | No Stripe / custodial / NFT copy | › 8. No Stripe / custodial / NFT copy (`body.innerText` on 4 routes + inside the wallet sheet) | — |
| 9 | CSS actually applied | › 9. CSS is applied (stylesheets, `--primary`, body bg, button radius/height/flex, fixed nav); 9b Geist renders on body and headings | — |
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

## Header (DELIVERY_LOOP.md)

`e2e/header.spec.ts` checks every route: `/`, `/pools/create`, `/join`, a pool, a missing pool, a malformed pool id, and an unknown URL. On each one it checks:
- The header is visible.
- The title is correct.
- Home shows the brand icon, and nested screens show Back.
- The Connect chip opens the wallet sheet.
- The theme toggles both ways.

The suite also checks four more behaviours:
- The header stays pinned while scrolling.
- Back from a deep link goes Home instead of leaving the app.
- Back after in-app navigation returns to the previous screen.
- With a connected wallet, the chip shows the address on every route and survives navigation. Home switches to "My pools", and Disconnect works.

The connected state comes from a mock Wallet Standard wallet (`installMockWallet`). It registers the same way real wallets do, so the app's own adapter stack lists it and connects to it. It refuses to sign.

Screenshots: `ui/h-*.png`.

## Bugs found and fixed

Each fix has a regression test.

| ID | Bug | Fix | Test |
|---|---|---|---|
| E2E-1 | `/pools/<malformed id>` loaded forever: `new PublicKey(id)` threw outside the try/catch. | `parsePublicKey()` in the data hook makes malformed ids resolve to not-found; the page also catches load failures. | ui › 7 "malformed pool id…" |
| E2E-2 | The Geist font was never applied: `--font-sans` resolved on `<html>`, but the font variables were set on `<body>`. | The font variable classes moved to `<html>`. | ui › 9b |
| E2E-3 | Unknown URLs rendered Next's bare 404 with no header. Route errors had no in-app fallback either. | Added `app/not-found.tsx` and `app/error.tsx`, both inside `AppShell`. | header › `/does-not-exist` |
| E2E-4 | With the RPC unreachable, the pool page said "Pool not found". | `fetchPool` returns `null` only for a missing or old-layout account and throws `ChainUnavailableError` otherwise. The page shows "Can't reach Solana" with a working Try again. | ui › 7 "unreachable RPC…" |
| E2E-5 | With the RPC unreachable, Join said "No pool matches that code". The same failure made Home show "No pools yet". | The invite lookup and `fetchUserPools` throw on outage. Join and Home show "Can't reach Solana", and Home has a working Try again. The invite lookup now decodes each pool separately, so one old-layout pool can't break it. | ui › 5, header › "home shows an honest error" |
| E2E-6 | Every screen loaded its chain data twice. `SolanaProvider` inserted `WalletModalProvider` after mount, which changed the tree shape and remounted the page. `ConnectionProvider`'s default config also built a new `Connection` on every provider render. Before mount, header Connect taps hit a no-op modal context. | One stable provider tree (only `autoConnect` waits for mount) and a module-level connection config. | ui › 7 "loads its data once" |
| E2E-7 | The theme toggle keyed off `theme` (`"system"` or `undefined` before mount), so the first tap depended on page state. | It toggles based on the `dark` class currently on `<html>`. | header › every route toggles both ways |

The header's Back button used `history.length`, which counts pages from other sites, so from a deep link it could leave the app. It now falls back to Home unless the user has navigated inside the app.

## Remaining gaps (not faked)

- **APK / webshell:** not built or tested here. The Mobile Wallet Adapter and Seed Vault handoff needs an Android device or emulator.
- **Funded-wallet draw on devnet:** not run. On-chain draw and payout correctness is proven in `security_p0` with an in-process bank. A real devnet round needs funded wallets and a deployed program.
- **Signing from the UI:** the mock wallet refuses to sign. The create, join, pay and draw transactions are covered on-chain, not through the browser.
- **Lint:** `npm run lint` still reports errors that were already on `main` (`no-explicit-any` in `use-solana-program.ts` and the cron route, among others). Lint is not part of the gate.
