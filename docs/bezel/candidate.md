# Bezel: the Arisan redesign

`main` carries the redesign and the full set of circle actions. The program is unchanged: zero lines in `arisan_contracts/` or the IDL. The client adds one transaction builder (`refund_all_stakes`, which existed on-chain with no client) and maps four pool fields it already decoded.

Design canvases (private): directions at https://claude.ai/artifact/17bwXGTQk7Ad3UE6jgJgzH, full design at https://claude.ai/artifact/4ZSACrFeH6uNmSUU1doDsM.

**Look**
- Hamza's end-card coin, rebuilt in Three.js as a dial: satin hammered gold, the maze emblem in minted relief, a square-cut emerald, emerald glass. The glass carries the circle: one mark per seat (open, joined, paid, won, late, each a different shape) and a round track (gold done, lume now, dark next). A gold pip at twelve is where the draw stops.
- Onyx dark theme (default) and a white-enamel light theme. Gold is money and the one main button; emerald is glass and confirmation; signal red is due or failed.
- Chivo for the interface, Chivo Mono for figures and addresses, Michroma for the small caps printed on the dial.
- 28 icons drawn on the dial's geometry replace lucide in the shell, tabs and toasts.
- A vector seal (the end-card coin redrawn) is the header mark; a 3D app icon is rendered from the live coin. Both are new files in `public/brand/`; Hamza's `logo.png`, `logo-mark.png` and icons are untouched and still used for the app icons.
- Copy says "circle". Toasts are one title, one quiet line and an Explorer link.

**Every program action, end to end**

| Instruction | Where | Notes |
|---|---|---|
| `create_pool` | Create | Seats 2–20, amount, stake None/1×/2×/3×, and now **Draws: Manual / Automatic** (`auto_mode`). |
| `join_pool` | Join, and "Take your seat" after Create | Shows seats taken (x/y), pot and the stake amount. Auto circles take the stake in the join; the button says how much. Full circles say so. |
| `deposit_stake` | Circle | "Deposit stake · 0.5 SOL", and "Restake · 0.5 SOL" in grace, with the round and deadline above it. |
| `start_pool` | Circle (host) | Only when every seat is taken and staked. Auto circles start themselves. |
| `leave_pool` | Circle (pending) | New. "Leave circle", confirmed inline; the stake comes back. |
| `make_payment` | Circle, and Home's next circle | Home pays in place when you're due. |
| `mark_defaulter` | Circle | New. After the deadline, unpaid seats are marked in one approval (up to 8 per transaction). Their stake covers the pot, so the draw can go ahead. |
| `commit_draw_randomness` + `execute_draw` | Circle | "Draw now" (two approvals) or "Finish the draw" (one) when a commit is pending. |
| `rejoin_pool` | Circle (removed member) | New. "Rejoin · 1 SOL": a fresh stake plus the missed rounds, as the program charges. |
| `claim_winnings` | Circle | Legacy draws only: `execute_draw` now pays the winner directly. |
| `claim_stake_refund` | Circle (complete) | "Get 0.5 SOL back". |
| `refund_all_stakes` | Circle (complete) | New. Anyone can send every remaining stake back; the caller pays the fee. |

Also:
- A balance check before money moves ("Not enough SOL" and a devnet faucet link) on Pay, Stake, Restake, Rejoin, Join and Create.
- The wallet chip opens a sheet: full address (tap to copy), balance, Explorer, Get SOL, Disconnect. It used to disconnect on tap.
- Home shows your own Due / Paid per active circle (one `getMultipleAccounts` for all their payment PDAs), and the next circle's dial shows its real seats.

**Draw safety.** The program pays `contribution × member_count` whether or not everyone paid, and an expired commit can never be redone. So the client:
- re-reads the pool before any approval and stops if the round moved (a stale page can't commit the next round);
- checks someone can still win before committing;
- offers the draw only after the deadline (plus a minute, two for auto circles), once every seat has either paid or been marked this round (a slashed stake covers it), and never for a round it just drew;
- puts "Finish the draw" first whenever a commit is pending, and explains an expired one instead of retrying.

Found by the new end-to-end test for "Finish the draw": the draw's second step read the slot hash with `Buffer.readBigUInt64LE`, which the browser's `Buffer` polyfill doesn't have. Every in-app draw would have committed and then thrown, locking the round. `bound-draw.ts` now reads u64s with `DataView` (same result as `Buffer` on 1,000 random inputs). The code was on `main` before the redesign, unused: `main` had no draw button.

Not covered by any client change: if nobody finishes a committed draw within 512 slots (about 3.4 minutes), that round is stuck for good. That needs a program change (allow a re-commit once the slot hash has expired).

**How**
- `src/lib/circle-state.ts`: one pure function decides what the viewer can do on a circle (`circleFacts` + `circleAction`), used by the circle screen and Home.
- `src/components/bezel/`: tokens in `globals.css` mapped onto the shadcn names; `kit.tsx` parts, `icons.tsx`, `seal.tsx`, `mini-dial.tsx` (SVG dial), `dial.tsx` + `dial-scene.ts` (3D dial), `circle-parts.tsx` (seat list, History table), `emblem.ts`.
- The 3D dial is one engine for the session: one renderer and canvas, lent to whichever dial is on screen. It renders only when something changes, from its own `requestAnimationFrame` loop that stops when idle. Shaders compile before the first frame; each theme's environment is built on first use. Theme toggles restyle it in place. A lost context hands the canvas back, shows the SVG and retries once the page is visible.
- 3D runs only on a real GPU. The probe asks for WebGL 2 with `failIfMajorPerformanceCaveat` and also reads the renderer name: headless Chromium (CI and local Playwright alike) renders WebGL with SwiftShader on the CPU and passes the caveat check, which is what timed out two CI tests on the first push. SwiftShader, llvmpipe and other software renderers, Save-Data and the open intro keep the SVG dial. `?dial=3d` and `?dial=svg` force either path.
- Every redesigned screen and Bezel component compiles under the React Compiler (checked with `babel-plugin-react-compiler` 1.0; the circle and Join pages used to bail out on `try/finally`).

**Tests**
- Typecheck: `npm run typecheck` → `docs/bezel/typecheck.log`.
- Build: `next build` → `docs/bezel/build.log`.
- Playwright: full UI + API suite on the mobile-390 project, against `next build && next start` → `docs/bezel/e2e.log`.
  - Run through a git-ignored Windows mirror of `playwright.config.ts`, because its web server uses POSIX `env VAR=x`. The mirror passes the same variables through `webServer.env` and uses the same 30 s test timeout as CI; the server was started separately with that environment on port 3117.
  - Result: 84 passed, 6 skipped (the `UI_PROOF` captures), 0 failed. Typecheck clean.
- New or changed on purpose:
  - every action in the table above asks the wallet for its instruction (`pool-actions.spec.ts`), including two marks in one transaction, a covered seat opening the draw, a seat in grace holding it, a pending commit finished without a new commit, an expired commit explained, rejoin, leave, return-all and low balance;
  - Take your seat keeps the invite screen and sends the code that was shown; Automatic draws sets `auto_mode`;
  - the wallet chip opens the sheet, then disconnects;
  - copy: circle, seats, sentence-case "Transaction failed", typographic apostrophes.
- Anchor `security_p0`: not run here (no Rust toolchain on this machine). The program is untouched; CI runs it.
- Known flake, not ours: `walkthrough.spec.ts` › "the last screen is about your wallet, never keys". It fails about 1 in 3 runs on unmodified `main` too. CI's retry covers it.

**Reviewers** (our agents, not Hamza's)
- Phase 2: design fidelity and build feasibility on the canvas. Fixes in `bezel: review round 1 on the foundation`.
- Round 2, on the full branch: logic and contract safety; React, 3D engine and accessibility; visual and copy QA. One P0, five P1s from logic and engine, eight visual P1s, and their P2s are fixed in `bezel: review round 2`:
  - P0: a stale "Draw now" could commit the next round and lock it. Fixed with the round re-read, `busy` through the reload, and the drawn-round guard.
  - Engine: the render loop never stopped after the first animation; an interrupted animation jammed the update queue for the session; the winner spin snapped at the end; numbers drifted after a failed draw; first attach compiled shaders on the main thread; context loss leaked a canvas.
  - Flow: Take your seat left the only screen with the invite code; no way past a non-payer (now Mark missed payments).
  - Visual: light-mode seat numbers hidden under the canvas; glass too olive and gold too orange; uneven code boxes; "Staked 0/0"; plurals; repeated lines; amounts missing from money buttons; toy-like empty states; wallet sheet details; contrast and focus rings; History and Join for screen readers.

**Not in this change**
- Hamza's live code isn't on GitHub. The live site runs the film intro (220 frames), DM Sans and walkthrough key `v11`; `main` doesn't. Merging his code will conflict in `layout.tsx` fonts and the walkthrough files. The live site is deployed by hand, so `main` changing doesn't change it.
- The film-to-dial hand-off (C4) waits for that code.
- USDC/USDT: `create_pool` accepts them, but `make_payment`, `deposit_stake` and `rejoin_pool` require SOL on-chain, so the app keeps SOL only.
- Stripe and custodial wallets stay off (docs/CLOCKIN.md: self-custodial only).
- The app icons and favicon still use Hamza's files. Switching to the 3D icon is one line in `manifest.ts`, once he agrees.
- Untested on a Seeker or the APK's WebView with the 3D dial. The SVG fallback covers any device where the probe fails.
- `npm run lint` still has errors that were already on `main`; lint isn't part of the gate.
