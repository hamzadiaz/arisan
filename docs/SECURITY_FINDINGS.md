# Arisan security findings — CLOCK IN blockers

Audited 2026-09-28 against `/Users/hamzadiaz/Projects/arisan` at `d05c2e1`.
These are **must-fix** before any real deposits or a hackathon demo that claims trustless draws.

## P0 — Draw does not select the winner

File: `arisan_contracts/programs/arisan_contracts/src/instructions/execute_draw.rs`

The instruction takes `winner_member` / `winner_wallet` as accounts. The caller chooses who wins.

`generate_pseudo_random(...)` writes `draw.vrf_result` but **does not** map that seed onto an eligible member. Comments say Switchboard VRF “in production”; the code still auto-pays whoever was passed in.

After `next_draw_timestamp`, **anyone** can call `execute_draw` (`is_authority || is_past_deadline`). Combined with caller-chosen winner, that is theft of the pot.

**Required fix:** program must derive the winner from on-chain randomness (Switchboard VRF on mainnet; a documented, non-manipulable fallback on devnet that still binds the winner to the random value). Caller must not pass the winner. Add an Anchor test that a malicious caller cannot pick themselves.

## P0 — `mark_defaulter` trusts the caller’s `has_paid` bool

File: `arisan_contracts/programs/arisan_contracts/src/lib.rs` (`mark_defaulter`)
File: `arisan_contracts/programs/arisan_contracts/src/instructions/mark_defaulters.rs`

Instruction is permissionless “for Clockwork”. The caller supplies `has_paid: bool`. A liar can slash / grace / kick a member who already paid.

**Required fix:** payment status must be read from on-chain Payment PDAs. Remove the bool. Add a test that a paid member cannot be marked default.

## P0 — Custodial transaction signing is in the product path

Files:

- `src/app/api/custodial/sign-transaction/route.ts`
- `src/app/api/custodial/create-wallet/route.ts`
- `src/lib/custodial/wallet-service.ts`

Server holds user keypairs and signs txs after Firebase auth. That is a honeypot and the opposite of Seed Vault.

Hamza decision: **CLOCK IN is self-custodial only.** Do not use custodial sign for the demo. Keep the code behind a dead flag or delete the routes from the CLOCK IN surface. Do not load custodial keys in production env.

## P1 — Weak / unused randomness

Roadmap already flags Switchboard VRF as CRITICAL pending.

Slot hash + timestamp is grindable and currently unused for selection anyway. Do not ship “verifiable random” copy until VRF (or a commit-reveal / hash-chain that actually binds the winner) is wired.

## P1 — Hardcoded cron auth in npm script

`package.json` `cron:trigger` embeds a Bearer token. Rotate. Read secret from env. Rate-limit `/api/cron/draw`. Prefer permissionless on-chain crank after deadline instead of a privileged cron that also picks winners.

## P1 — Invite code in transaction logs

Hashed on-chain (good) but plaintext is captured from logs for the UI (see `solana.md`). Anyone watching the create tx learns the code.

**Fix:** return the code to the creator client only (simulate / return data), never emit plaintext in program logs.

## P2 — Stripe / Web2 on-ramp

Stripe checkout/webhook exist. Out of scope for CLOCK IN. Do not demo card → custodial SOL. USDC in a user wallet is the path.

## P2 — Roadmap items still pending

`PRODUCTION_ROADMAP.md` (Feb 2026) still lists: exposed scheduler keys, missing frontend validation, no cron rate limit, hardcoded 5-minute draw interval, incomplete SPL token vaults.

`.env*` is gitignored and no env files are tracked (good). Do not reintroduce secrets.

## Tests that must go green

Existing suite under `arisan_contracts/tests/` (hashed invite, auto mode, e2e, edge cases). Add:

1. Malicious `execute_draw` cannot choose winner
2. Paid member cannot be defaulted
3. Unpaid member can be defaulted only after round deadline
4. Vault pays exactly `contribution_amount * member_count` to the derived winner

## CLOCK IN security bar

“Prod-ready” here means: **devnet demo cannot be stolen by the person who clicks Draw.** Mainnet VRF can follow if Switchboard is too heavy for 8 Oct, but the winner must still be derived from the random value, not the account list order the client passes.
