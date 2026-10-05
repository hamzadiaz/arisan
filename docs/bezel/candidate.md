# Bezel: the Arisan redesign

`main` carries the redesign and the full set of circle actions. The program is unchanged: zero lines in `arisan_contracts/` or the IDL. The client adds one transaction builder (`refund_all_stakes`, which existed on-chain with no client) and maps four pool fields it already decoded.

**Read this first: devnet runs an older program.** The program at the app's address on devnet was deployed on 2025-12-12 and predates this repo's program (the bound draw, return-data invite codes, the roster). Against it, the live site and `main` can create a circle but can't read it back, show its invite code or draw. Only an upgrade by the program's authority fixes that. `docs/bezel/devnet.md` has the evidence, a build recipe that works, and the deploy commands. Everything below was verified against the repo's program on a local validator.

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
| `deposit_stake` | Circle | "Deposit stake · 0.5 SOL". In grace, "Restake and pay · 1 SOL": the stake and this round's payment in one transaction, so the seat can't be marked (and slashed) a second time in between. |
| `start_pool` | Circle (host) | Only when every seat is taken and staked. Auto circles start themselves. |
| `leave_pool` | Circle (pending) | New. "Leave circle", confirmed inline; the stake comes back. |
| `make_payment` | Circle, and Home's next circle | Home pays in place when you're due. |
| `mark_defaulter` | Circle | New. After the deadline, unpaid seats are marked in one approval (up to 8 per transaction). Their stake covers the pot, so the draw can go ahead. Once a seat's 48-hour grace is over the button says "Remove 1 seat" and warns when that seat hasn't won (the circle can't finish without it). |
| `commit_draw_randomness` + `execute_draw` | Circle | Two taps: "Draw now" commits, "Finish the draw" pays the winner. A second wallet prompt without a tap can be blocked on Android, so the app never chains them. |
| `rejoin_pool` | Circle (removed member) | New. "Rejoin and pay · 1.5 SOL": a fresh stake, the missed rounds (as the program charges) and this round's payment in one transaction. |
| `claim_winnings` | Circle | Legacy draws only: `execute_draw` now pays the winner directly. |
| `claim_stake_refund` | Circle (complete) | "Get 0.5 SOL back". |
| `refund_all_stakes` | Circle (complete) | New. Anyone can send every remaining stake back; the caller pays the fee. |

Also:
- A balance check before money moves (the amount plus fees and account rent; "Not enough SOL" and a devnet faucet link, the same line everywhere) on Pay, Stake, Restake, Rejoin, Draw, Join and Create.
- A transaction that lands but fails on-chain is reported as failed. Before, `confirmTransaction`'s `value.err` was ignored and the app said "done".
- The wallet chip opens a sheet: full address (tap to copy), balance, Explorer, Get SOL, Disconnect. It used to disconnect on tap.
- Home shows your own Due / Paid per active circle (one `getMultipleAccounts` over their payment PDAs, counting only real Payment accounts), and the next circle, read afresh, shows its real seats and pays in place.
- A failed read shows "Can't reach Solana" instead of empty lists (which read as "nobody paid" and offered transactions that could only fail).

**Draw safety.** The program pays `contribution × member_count` whether or not everyone paid, and an expired commit can never be redone. So the client and the auto-draw scheduler follow one rule (`src/lib/solana/round-settlement.ts`):
- a draw starts only after the deadline (plus a minute in the app, two for automatic circles so the server goes first), once every seat has paid or was marked this round (its slashed stake covers it); a seat still in grace from an earlier round holds the draw;
- before committing: the pool is re-read (a stale page can't commit the next round), someone must be able to win, and the vault must cover the pot without touching stakes owed back;
- the commit is signed, the pool read again, and only then sent; after it lands, the round is checked again;
- the finish step only needs the vault to cover the pot (refusing would lock the whole circle), tops the vault up when dust would leave it below rent, and asks for a 400k compute budget for twenty seats;
- an unpaid member is offered Pay before Finish; before the deadline only the host sees Finish; an expired commit is explained, not retried.
- The cron (`scheduler.ts`) used to draw automatic circles with no checks at all, so an unpaid seat could win a pot paid from other members' stakes. It now marks missed seats, skips rounds that a seat in grace still owes, and never commits when nobody can win.

Found by the new end-to-end test for "Finish the draw": the draw's second step read the slot hash with `Buffer.readBigUInt64LE`, which the browser's `Buffer` polyfill doesn't have. Every in-app draw would have committed and then thrown, locking the round. `bound-draw.ts` now reads u64s with `DataView` (same result as `Buffer` on 1,000 random inputs). The code was on `main` before the redesign, unused: `main` had no draw button.

Not covered by any client change, and worth a program fix: if nobody finishes a committed draw within 512 slots (about 3.4 minutes), the circle is stuck for good; and the commit takes no round, so it can't refuse a stale round on its own. An `expected_round` argument plus a re-commit after expiry would close both.

**How**
- `src/lib/circle-state.ts`: one pure function decides what the viewer can do on a circle (`circleFacts` + `circleAction`), used by the circle screen and Home.
- `src/components/bezel/`: tokens in `globals.css` mapped onto the shadcn names; `kit.tsx` parts, `icons.tsx`, `seal.tsx`, `mini-dial.tsx` (SVG dial), `dial.tsx` + `dial-scene.ts` (3D dial), `circle-parts.tsx` (seat list, History table), `emblem.ts`.
- The 3D dial is one engine for the session: one renderer and canvas, lent to whichever dial is on screen. It renders only when something changes, from its own `requestAnimationFrame` loop that stops when idle. Shaders compile before the first frame; each theme's environment is built on first use. Theme toggles restyle it in place. A lost context hands the canvas back, shows the SVG and retries once the page is visible.
- 3D runs only on a real GPU. The probe asks for WebGL 2 with `failIfMajorPerformanceCaveat` and also reads the renderer name: headless Chromium (CI and local Playwright alike) renders WebGL with SwiftShader on the CPU and passes the caveat check, which is what timed out two CI tests on the first push. SwiftShader, llvmpipe and other software renderers, Save-Data and the open intro keep the SVG dial. `?dial=3d` and `?dial=svg` force either path.
- Every redesigned screen and Bezel component compiles under the React Compiler (checked with `babel-plugin-react-compiler` 1.0; the circle and Join pages used to bail out on `try/finally`).
- First-load JavaScript is 17–38 KB gzipped more than before the redesign (494–517 KB per route, measured against a build of the pre-redesign `main`); three.js (135 KB gzipped) loads only when a 3D dial is on screen.

**Tests**
- Typecheck: `npm run typecheck` → `docs/bezel/typecheck.log`.
- Build: `next build` → `docs/bezel/build.log`.
- Playwright: full UI + API suite on the mobile-390 project, against `next build && next start` → `docs/bezel/e2e.log`.
  - Run through a git-ignored Windows mirror of `playwright.config.ts`, because its web server uses POSIX `env VAR=x`. The mirror passes the same variables through `webServer.env` and uses the same 30 s test timeout as CI; the server was started separately with that environment on port 3117.
  - Result: 93 passed, 7 skipped (the six `UI_PROOF` captures and the opt-in chain test), 0 failed. Typecheck clean.
- On a real chain (`docs/bezel/onchain.log`, `docs/bezel/chain-ui.log`): the repo's program, built in Docker and loaded into `solana-test-validator` 1.18 at the app's address.
  - Every action through the app's own builders and the scheduler: 21 of 21 steps, both circles ending with an empty vault. Manual: create (invite code read back), join ×2, stake ×2, start, pay, a non-host draws after the deadline, pay, the host draws, claim_stake_refund, refund_all_stakes. Automatic: join takes the stake, leave refunds it, the second join starts the circle, the scheduler marks the unpaid seat and draws the paid one, restake-and-pay in one transaction, the scheduler draws round 2, both refunds.
  - The UI itself, two browsers with wallets that really sign (`e2e/chain.spec.ts`, opt-in with `CHAIN_RPC`): create, take your seat, stake, join with the code, stake, start, both pay, Draw now then Finish, both pay, the host draws round 2, both stakes back, "Complete". Passed in 13 minutes.
- New or changed on purpose:
  - every action in the table above asks the wallet for its instruction (`pool-actions.spec.ts`), including two marks in one transaction, a covered seat opening the draw, a seat in grace holding it, a seat marked without a stake holding it, a stake-free circle holding it, the two-minute wait on automatic circles, a removal, Pay before Finish, a host-only early Finish, a stale page that can't start the draw, a pending commit finished without a new commit, an expired commit explained, restake-and-pay, rejoin-and-pay, leave, return-all and low balance;
  - Home pays the next circle in place and shows Due; a transaction that fails on-chain is reported as failed (`home-pay.spec.ts`);
  - Take your seat keeps the invite screen and sends the code that was shown; Automatic draws sets `auto_mode`;
  - the wallet chip opens the sheet, then disconnects;
  - copy: circle, seats, sentence-case "Transaction failed", typographic apostrophes.
- Anchor `security_p0`: not run here; CI runs it (green on `main`). The program is untouched.
- Known flake, not ours: `walkthrough.spec.ts` › "the last screen is about your wallet, never keys". It fails about 1 in 3 runs on unmodified `main` too. CI's retry covers it.

**Reviewers** (our agents, not Hamza's)
- Phase 2: design fidelity and build feasibility on the canvas. Fixes in `bezel: review round 1 on the foundation`.
- Round 2, on the full branch: logic and contract safety; React, 3D engine and accessibility; visual and copy QA. One P0, five P1s from logic and engine, eight visual P1s, and their P2s are fixed in `bezel: review round 2`:
  - P0: a stale "Draw now" could commit the next round and lock it. Fixed with the round re-read, `busy` through the reload, and the drawn-round guard.
  - Engine: the render loop never stopped after the first animation; an interrupted animation jammed the update queue for the session; the winner spin snapped at the end; numbers drifted after a failed draw; first attach compiled shaders on the main thread; context loss leaked a canvas.
  - Flow: Take your seat left the only screen with the invite code; no way past a non-payer (now Mark missed payments).
  - Visual: light-mode seat numbers hidden under the canvas; glass too olive and gold too orange; uneven code boxes; "Staked 0/0"; plurals; repeated lines; amounts missing from money buttons; toy-like empty states; wallet sheet details; contrast and focus rings; History and Join for screen readers.

- Round 3, on `main` after round 2: the same three reviews again.
  - Logic: the cron drew automatic circles with no checks (P0); a commit race could still land on the next round (P0); no vault check before the commit; no balance check on Draw; restake and rejoin left the round unpaid (a second slash was possible); kicks looked like marks; on-chain failures read as success. All fixed above.
  - Engine and accessibility: no P0 or P1. Focus rings everywhere, a compile in flight survives context loss, a stale update can't drop a newer spec, no negative frame steps, no tick during a spin, warm-up for every mark material, a cap on context-loss retries, wallet sheet and Leave focus, select-all in the code input.
  - Visual: light seat marks invisible on the glass, and the empty dial a green puck (P1s); lime rim, amber gold, pinprick marks, the Create button under the tab bar, repeated lines in pending and complete states, waiting states styled as done, truncated History addresses, three low-SOL patterns, and ragged hints. All fixed: mint glass and pale gold in light, deeper emerald and satin gold in dark, marks 1.7× larger, joined seats as dark dots, a page-tone empty dial, a sticky Create button.
  - Found while verifying, beyond the reviews: the devnet program is out of date (top of this file), and the browser `Buffer` bug in the draw.

**Not in this change**
- Hamza's live code isn't on GitHub. The live site runs the film intro (220 frames), DM Sans and walkthrough key `v11`; `main` doesn't. Merging his code will conflict in `layout.tsx` fonts and the walkthrough files. The live site is deployed by hand, so `main` changing doesn't change it.
- The film-to-dial hand-off (C4) waits for that code.
- USDC/USDT: `create_pool` accepts them, but `make_payment`, `deposit_stake` and `rejoin_pool` require SOL on-chain, so the app keeps SOL only.
- Stripe and custodial wallets stay off (docs/CLOCKIN.md: self-custodial only).
- The app icons and favicon still use Hamza's files. Switching to the 3D icon is one line in `manifest.ts`, once he agrees.
- Untested on a Seeker or the APK's WebView with the 3D dial. The SVG fallback covers any device where the probe fails.
- `npm run lint` still has errors that were already on `main`; lint isn't part of the gate.
