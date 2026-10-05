# Bezel: the Arisan redesign

`main` carries the redesign and the full set of circle actions. The program changes in one instruction, `execute_draw` (removed seats no longer block the draw; see "Program follow-up"), with no change to the IDL or its accounts. The client adds one transaction builder (`refund_all_stakes`, which existed on-chain with no client) and maps four pool fields it already decoded.

**Read this first: devnet runs an older program.** The program at the app's address on devnet was deployed on 2025-12-12 and predates this repo's program (the bound draw, return-data invite codes, the roster). Against it, the live site and `main` can create a circle but can't read it back, show its invite code or draw. Only an upgrade by the program's authority fixes that. `docs/bezel/devnet.md` has the evidence, a build recipe that works, and the deploy commands. Everything below was verified against the repo's program on a local validator.

Design canvases (private): directions at https://claude.ai/artifact/17bwXGTQk7Ad3UE6jgJgzH, full design at https://claude.ai/artifact/4ZSACrFeH6uNmSUU1doDsM.

**Look**
- Hamza's end-card coin, rebuilt in Three.js as a dial: satin hammered gold, the maze emblem in minted relief, a square-cut emerald, emerald glass. The glass carries the circle: one mark per seat (open, joined, paid, won, late, each a different shape) and a round track (gold done, lume now, dark next). A gold pip at twelve is where the draw stops.
- Onyx dark theme (default) and a white-enamel light theme. Gold is money and the one main button; emerald is glass and confirmation; signal red is due or failed.
- Chivo for the interface, Chivo Mono for figures and addresses, Michroma for the small caps printed on the dial.
- 28 icons drawn on the dial's geometry replace lucide in the shell, tabs and toasts.
- A vector seal (the end-card coin redrawn) is the header mark; a 3D app icon is rendered from the live coin. Both are new files in `public/brand/`; Hamza's `logo.png`, `logo-mark.png` and icons are untouched and still used for the app icons.
- Copy says "circle". Toasts are one title, one quiet line and an Explorer link.
- The app bar has round bezel buttons for Back and theme, the ARISAN wordmark in the dial's small caps on Home, and a Connect chip with a wallet icon. The tab bar is a floating dock: Home (the coin and its pentagon) and Join (an invite ticket) either side of Create, a gold coin set into the dock.
- Join leads with a dial that saves you a lit seat (then shows the found circle with your seat), dot placeholders instead of sample letters, a lookup that runs on the eighth character, and a short "how joining works" track.
- The first-visit intro explains Arisan in four slides, laid out like Hamza's PurrSpeak onboarding: an eyebrow, the 3D dial with six people seated round it, a heavy gold headline (the app's Chivo) with one concrete line, Back, dots and Next in a card, and three facts underneath (0% interest, a fair draw, the stake back). The people take their seats; each pays in and a coin flies into the pot (6 × 0.5 = 3 SOL); tap Draw and a light runs round the table to the winner, whose coin flips; on the last slide a demo wallet asks you to approve round two. It follows the app theme, works by swipe, buttons or keys, rests on each slide's point with reduced motion, and hands its warmed-up dial to the page underneath.

**Every program action, end to end**

| Instruction | Where | Notes |
|---|---|---|
| `create_pool` | Create | Seats 2–20, amount, stake None/1×/2×/3×, and now **Draws: Manual / Automatic** (`auto_mode`). |
| `join_pool` | Join, and "Take your seat" after Create | Shows seats taken (x/y), pot and the stake amount. Auto circles take the stake in the join; the button says how much. Full circles say so. |
| `deposit_stake` | Circle | "Deposit stake · 0.5 SOL". In grace, "Restake and pay · 1 SOL": the stake and this round's payment in one transaction, so the seat can't be marked (and slashed) a second time in between. |
| `start_pool` | Circle (host) | Only when every seat is taken and staked. Auto circles start themselves. |
| `leave_pool` | Circle (pending) | New. "Leave circle", confirmed inline; the stake comes back. |
| `make_payment` | Circle, and Home's next circle | Home pays in place when you're due. |
| `mark_defaulter` | Circle | New. After the deadline, unpaid seats are marked in one approval (up to 8 per transaction): the stake is slashed, a 48-hour grace starts, and the draw waits for them. Once grace is over the button says "Remove 1 seat": the draw goes on without them, and a seat that hasn't won loses its turn unless it rejoins. |
| `commit_draw_randomness` + `execute_draw` | Circle | Two taps: "Draw now" commits, "Finish the draw" pays the winner. A second wallet prompt without a tap can be blocked on Android, so the app never chains them. |
| `rejoin_pool` | Circle (removed member) | New. "Rejoin and pay · 1.5 SOL": a fresh stake, the missed rounds (as the program charges) and this round's payment in one transaction. |
| `claim_winnings` | Circle | Legacy draws only: `execute_draw` now pays the winner directly. |
| `claim_stake_refund` | Circle (complete) | "Get 0.5 SOL back". |
| `refund_all_stakes` | Circle (complete) | New. Anyone can send every remaining stake back; the caller pays the fee. |

Also:
- A balance check before money moves (the amount plus fees and account rent; "Not enough SOL" and a devnet faucet link, the same line everywhere) on Pay, Stake, Restake, Rejoin, Draw, Join and Create.
- A transaction that lands but fails on-chain is reported as failed. Before, `confirmTransaction`'s `value.err` was ignored and the app said "done".
- The wallet chip opens a sheet: full address (tap to copy), balance, Explorer, Get SOL, Disconnect. It used to disconnect on tap.
- Share invite sends a link (`/join?code=…`) that opens Join with the code filled in and the circle found.
- Home shows your own Due / Paid per active circle (one `getMultipleAccounts` over their payment PDAs, counting only real Payment accounts), and the next circle, read afresh, shows its real seats and pays in place.
- A failed read shows "Can't reach Solana" instead of empty lists (which read as "nobody paid" and offered transactions that could only fail).

**Draw safety.** An expired commit can never be redone, so the client and the auto-draw scheduler follow one rule (`src/lib/solana/round-settlement.ts`):
- a draw starts only after the deadline (plus a minute in the app, two for automatic circles so the server goes first), once every seat still in has paid; a seat in grace holds the draw until it pays, or until it's removed once its grace is over;
- before committing: the pool is re-read (a stale page can't commit the next round), someone must be able to win, and the vault must cover the pot without touching stakes owed back;
- the commit is signed, the pool read again, and only then sent; after it lands, the round is checked again;
- the finish step only needs the vault to cover the pot (refusing would lock the whole circle), tops the vault up when dust would leave it below rent, and asks for a 400k compute budget for twenty seats;
- an unpaid member is offered Pay before Finish; before the deadline only the host sees Finish; an expired commit is explained, not retried.
- The cron (`scheduler.ts`) used to draw automatic circles with no checks at all, so an unpaid seat could win a pot paid from other members' stakes. It now marks missed seats, skips rounds that a seat still owes, and never commits when nobody can win or when its wallet couldn't pay for the finish.
- A started draw that nobody finishes would lock the circle in about 3.4 minutes. The cron now finishes any started draw past its deadline, in manual circles too (it never marks or starts a draw there), handles started draws first, and skips an expired commit at once instead of waiting 30 s on it every run.
- The host, who can finish before the deadline, sees Finish before Pay. While the unpaid seats are the last ones left that can win, neither the app nor the cron marks or removes those yet to win: removing them would leave rounds nobody can take, so the round waits for them to pay. Unpaid seats that already won are still marked.

**Since Hamza's program change (PR #23, 5 Oct).** `execute_draw` needs a current-round Payment from every seat, and `start_pool` the full staked roster. The app and the cron follow it: no draw (and no commit) until every seat still in has paid; marking is a penalty (slash and grace), not a way to open the draw; the host pays before finishing a draw they started early; and the app checks every payment again just before it commits or finishes, so it never sends a draw the program would refuse (a commit that can't be finished locks the circle).

**Program follow-up (`execute_draw.rs`; live once devnet is upgraded).** PR #23 also wanted a Payment from removed seats, which can't pay (`make_payment` rejects `is_kicked`), so one removal blocked every later draw until that seat rejoined. `execute_draw` now skips removed seats (their Payment address is still checked); the pot, `contribution × member_count`, already left them out. A removed seat that never won would then leave a last round nobody can take (`NoEligibleMembers` for good, every stake locked), so the circle also completes after the draw that leaves no one able to win. The remaining accounts are unchanged, so the app's builders are too. Two new `security_p0` tests: a removed seat holds the draw while in grace, then the draw goes ahead on the paid seats' pot and the circle ends a round early; and a circle without removals still runs every round.

Still open for Hamza (program design, unchanged): if the last seat that can still win stops paying, no later draw can finish; the app and the cron never remove that seat, so it can still pay. Slashed stakes and the missed-round charge in `rejoin_pool` stay in the vault: nothing pays them out.

Found by the new end-to-end test for "Finish the draw": the draw's second step read the slot hash with `Buffer.readBigUInt64LE`, which the browser's `Buffer` polyfill doesn't have. Every in-app draw would have committed and then thrown, locking the round. `bound-draw.ts` now reads u64s with `DataView` (same result as `Buffer` on 1,000 random inputs). The code was on `main` before the redesign, unused: `main` had no draw button.

Not covered by any client change, and worth a program fix: if nobody finishes a committed draw within 512 slots (about 3.4 minutes), the circle is stuck for good; and the commit takes no round, so it can't refuse a stale round on its own. An `expected_round` argument plus a re-commit after expiry would close both.

**How**
- `src/lib/circle-state.ts`: one pure function decides what the viewer can do on a circle (`circleFacts` + `circleAction`), used by the circle screen and Home.
- `src/components/bezel/`: tokens in `globals.css` mapped onto the shadcn names; `kit.tsx` parts, `icons.tsx`, `seal.tsx`, `mini-dial.tsx` (SVG dial), `dial.tsx` + `dial-scene.ts` (3D dial), `circle-parts.tsx` (seat list, History table), `emblem.ts`.
- The 3D dial is one engine for the session: one renderer and canvas, lent to whichever dial is on screen. It renders only when something changes, from its own `requestAnimationFrame` loop that stops when idle. Shaders compile before the first frame; each theme's environment is built on first use. Theme toggles restyle it in place. A lost context hands the canvas back and retries once the page is visible; after three losses the device keeps the SVG.
- 3D runs only on a real GPU. The probe asks for WebGL 2 with `failIfMajorPerformanceCaveat` and also reads the renderer name: headless Chromium (CI and local Playwright alike) renders WebGL with SwiftShader on the CPU and passes the caveat check, which is what timed out two CI tests on the first push. The probe runs in `<head>` before first paint (`gl-probe.ts`) and marks `<html data-gl>`. SwiftShader, llvmpipe and other software renderers and Save-Data keep the SVG dial. Where 3D is coming, the SVG stays hidden rather than painting first, so a flat dial never turns into a tilted one in front of you; if the 3D dial isn't up in 2.5 s, the SVG stands in until it is. A dial that mounts once the engine is warm draws in 3D in its first frame. While the intro is open, page dials wait; when it closes, the page's dial takes the engine at once and the intro keeps a still of its last frame while it fades. `?dial=3d` and `?dial=svg` force either path.
- Every redesigned screen and Bezel component compiles under the React Compiler (checked with `babel-plugin-react-compiler` 1.0; the circle and Join pages used to bail out on `try/finally`).
- First-load JavaScript is 17–38 KB gzipped more than before the redesign (494–517 KB per route, measured against a build of the pre-redesign `main`); three.js (135 KB gzipped) loads only when a 3D dial is on screen.

**Tests**
- Typecheck: `npm run typecheck` → `docs/bezel/typecheck.log`.
- Build: `next build` → `docs/bezel/build.log`.
- Playwright: full UI + API suite on the mobile-390 project, against `next build && next start` → `docs/bezel/e2e.log`.
  - Run through a git-ignored Windows mirror of `playwright.config.ts`, because its web server uses POSIX `env VAR=x`. The mirror passes the same variables through `webServer.env` and uses the same 30 s test timeout as CI; the server was started separately with that environment on port 3117.
  - Result: 101 passed, 7 skipped (the six `UI_PROOF` captures and the opt-in chain test), 0 failed. Typecheck clean.
- On a real chain (`docs/bezel/onchain.log`, `docs/bezel/chain-ui.log`): the repo's program, built in Docker and loaded into `solana-test-validator` 1.18 at the app's address.
  - Every action through the app's own builders and the scheduler: 25 of 25 steps across three circles, the two finished ones ending with an empty vault. Manual: create (invite code read back), join ×2, stake ×2, start, pay, a non-host draws after the deadline, pay, the host draws, claim_stake_refund, refund_all_stakes. Automatic: join takes the stake, leave refunds it, the second join starts the circle, the scheduler marks the unpaid seat and draws the paid one, restake-and-pay in one transaction, the scheduler draws round 2, both refunds. Stranded: the scheduler leaves a manual circle alone, then finishes a draw a member started and abandoned.
  - The UI itself, two browsers with wallets that really sign (`e2e/chain.spec.ts`, opt-in with `CHAIN_RPC`): create, take your seat, stake, join with the code, stake, start, both pay, Draw now then Finish, both pay, the host draws round 2, both stakes back, "Complete". Passed in 13 minutes.
- New or changed on purpose:
  - every action in the table above asks the wallet for its instruction (`pool-actions.spec.ts`), including two marks in one transaction, a covered seat opening the draw, a seat in grace holding it, a seat marked without a stake holding it, a stake-free circle holding it, the two-minute wait on automatic circles, a removal, a removed seat not holding the draw, the last seat that can win spared while one that already won is marked, Pay before Finish, a host-only early Finish, a stale page that can't start the draw, a pending commit finished without a new commit, an expired commit explained, restake-and-pay, rejoin-and-pay, leave, return-all and low balance;
  - Home pays the next circle in place and shows Due; a transaction that fails on-chain is reported as failed (`home-pay.spec.ts`);
  - Take your seat keeps the invite screen and sends the code that was shown; Automatic draws sets `auto_mode`;
  - the wallet chip opens the sheet, then disconnects;
  - copy: circle, seats, sentence-case "Transaction failed", typographic apostrophes.
- Anchor `security_p0`: 10 passed, 1 ignored (P-2), run in Docker with stable Rust → `docs/bezel/security_p0.log`. The new removed-seat test fails on the previous `execute_draw` with `RoundNotFullyPaid`, the deadlock it covers. CI runs the suite too.
- The walkthrough tests were rewritten for the new intro: four slides on one dial, trying the draw and the approval, keys (arrows, Escape, a Tab loop), reduced motion (each slide rests on its point; a tap jumps to the end), and the hand-off: under the intro the landing dial waits with its SVG hidden, and on Get started it goes straight to 3D (`auto` → `webgl`, never `svg`) while the intro fades.

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
- Round 4, a final check of round 3: no P0 or P1 on screens; six P2s fixed: seat marks now mean the same as the rest of the app (filled = paid, hollow = due) in both themes; the SVG dial that paints first matches the 3D one (deep emerald in dark, mint in light, the page tone when empty) and the 3D canvas fades in over it; thinner virtual glass removes the neon underglow in dark and the olive band in light; the wallet library's Connect sheet takes focus and names its close button; focus never hides under the sticky bars; stake-free hosts read "Everyone’s in". Logic found no P0. Its P1 (a started draw in a manual circle relied on a second human tap) and P2s (expired commits stalled the cron, the cron could start draws it couldn't finish, host ordering for wallets without `signTransaction`) are fixed as described under Draw safety, and verified on the local chain (`docs/bezel/onchain.log`, scenario C).

**Live feedback, 5 October**
- "Walkthrough screens don't look good": they were still the original 2D canvas scene (cartoon coins, a bowl, rays), the one screen the redesign hadn't touched. The intro now runs on the Bezel dial (see Look).
- Then Hamza: the current slides "are lame and not that clear", with his PurrSpeak onboarding as the reference (a screen recording). The intro was rebuilt to explain the app step by step, in that layout (see Look).
- "When done and joined something weird happens with the landing page icon": filmed on the live site with a real GPU. After the intro, the landing dial painted its flat SVG (face-on, bright) and about 1.5 s later crossfaded into the 3D dial (tilted, hammered): a different shape morphing in place. three.js only began loading once the intro closed. Connecting a wallet did it again, and an account with no circles then lost the coin altogether (the empty bezel). Fixed: the SVG never paints first where 3D is coming, the intro warms the engine, the hand-off is instant, and Home keeps the coin in the glass while it loads, when you have no circles and when Solana can't be reached.

- Found while capturing the store screenshots on a real GPU: a returning, signed-in user's Home dial could stay flat for the whole visit. Signing in swaps Home's dial (loading, then the next circle) while the first shader compile runs in the background; the swap rebuilt the dial and freed materials three.js was still checking, its `compileAsync` check threw, and the engine never became ready. Freed meshes now wait for the compile to end, and a compile can't hold the dial past 8 s. Software WebGL (CI) compiles at once and hid the race, so the new test (`bezel.spec.ts`) reports the parallel-compile extension and keeps shaders "compiling" for a few seconds, as a phone does: it fails on the old build and passes now.

- Hamza's review notes (5 Oct), fixed: signed-out Home has one Connect (no header chip) and no Join link (the Join tab is right below), with the dial and the button centred in the space above the dock; the Create coin sits inside the dock instead of hanging over it; Find circle never looks disabled (with the code incomplete it says what's missing and puts the caret back); a full code pasted over another full code is looked up; Create's empty fields read as hints ("e.g. Family circle", "e.g. 0.5", dimmed) instead of values. His intro change (hiding the app behind the intro) needed the tests' page-ready check to accept the intro; that's in too.

**Not in this change**
- The live site is deployed by hand: it serves `main`'s Bezel build (walkthrough key `v1`), and pushing to `main` doesn't update it. Hamza's film intro (220 frames, key `v11`, DM Sans) was live on 4 October and still isn't on GitHub; merging it will conflict in `layout.tsx` fonts and the walkthrough files.
- The film-to-dial hand-off (C4) waits for that code.
- USDC/USDT: `create_pool` accepts them, but `make_payment`, `deposit_stake` and `rejoin_pool` require SOL on-chain, so the app keeps SOL only.
- Stripe and custodial wallets stay off (docs/CLOCKIN.md: self-custodial only).
- The app icons and favicon still use Hamza's files. Switching to the 3D icon is one line in `manifest.ts`, once he agrees.
- Untested on a Seeker or the APK's WebView with the 3D dial. The SVG fallback covers any device where the probe fails.
- `npm run lint` still has errors that were already on `main`; lint isn't part of the gate.
