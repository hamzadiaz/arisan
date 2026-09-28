# CLOCK IN — Solana Mobile Hackathon brief (Arisan)

Last updated: 2026-09-28

Official post: https://solanamobile.com/blog/clock-in-the-solana-mobile-hackathon

## Deadline

- Submissions open: 8 Sep 2026
- **Submissions close: 8 Oct 2026**
- Winners announced: early November 2026

## What to submit by 8 Oct

1. Functional Android APK
2. GitHub repo with source
3. Demo video of the app in use
4. Pitch deck / short presentation

Register/submit via the Radiants CLOCK IN site (solanamobile.com/hackathon).

Winners must later publish on the Solana dApp Store to claim prizes. A reasonable window is given after results. Do not block the 8 Oct APK on full dApp Store listing.

## Prizes

- $125,000 USDC across 10 teams (1st $30k … 6th–10th $5k)
- Separate **$10,000 SKR** prize for a meaningful SKR integration (optional)
- Featured dApp Store placement, co-marketing, Seeker devices, call with Anatoly

## Judging

- Stickiness / product-market fit
- User experience (polished, mobile, actually usable)
- Innovation
- Presentation / demo

Judges include Anatoly Yakovenko, Mert Mumtaz, Chase Barker, Solana Mobile BD.

Last hackathon winners had **deep Solana + Mobile Wallet Adapter**, not a Web2 wrap. Nomadz (gamified travel) is the closest consumer analog.

## Product decision (Hamza, 2026-09-28)

- **Ship Arisan**, not FoodDex NFTs.
- Do **not** mint NFTs. Collectibles/photos are off-chain. Fees belong on real money movement (monthly pool pay-in), not on every user action.
- Wallet = identity. Seeker Connect / Mobile Wallet Adapter.
- Skip Stripe + custodial-wallet product path for CLOCK IN. Self-custodial Seed Vault / Phantom / Solflare only.
- SKR is optional extra prize: one real use (e.g. SKR to create a pool, or SKR boost for a round) — not a fake toggle.
- Seeker Genesis Token can be a read-only “Seeker circle” badge / anti-sybil. No mint.

## Mobile / Seeker requirements

- You do **not** need a Seeker to build. Android emulator or phone is enough.
- APK path for a Next.js web app: `solana-mobile webshell` (WebView shell). Do **not** use Bubblewrap/TWA — it breaks MWA under Local Network Access.
- Seeker Connect is available for **web** now. React Native / Kotlin SDKs were still planned as of Sep 2026.
- MWA on Android Chrome + WebView. Not iOS.

Docs:

- https://docs.solanamobile.com/get-started/web/apps.md
- https://docs.solanamobile.com/solana-mobile-stack/seeker-connect.md
- https://docs.solanamobile.com/recipes/general/publishing-a-web-app.md
- https://docs.solanamobile.com/solana-mobile-stack/skr.md
- https://docs.solanamobile.com/solana-mobile-stack/seeker-genesis-token.md

## CLOCK IN cut (what “prod-ready” means for 8 Oct)

Must demo on a phone/emulator:

1. Connect wallet (Seeker Connect / MWA)
2. Create a USDC or SOL rotating pool with invite code
3. Second wallet joins
4. Members pay a round
5. Draw selects winner **on-chain from randomness**, auto-pays
6. UI is mobile-first, not a desktop dashboard squeezed onto a phone

Out of scope for CLOCK IN:

- Stripe on-ramp
- Server-side custodial key signing
- FoodDex / NFT minting
- iOS / App Store / RevenueCat
- Full dApp Store publish (prepare APK only)

## Repo

- GitHub: `hamzadiaz/arisan` (private)
- Local: `/Users/hamzadiaz/Projects/arisan`
- Program id (devnet): `BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6`
- Last product commit before this CLOCK IN push: `d05c2e1` (2026-02-08)

## PR policy

- One concern per PR. Do not mix UI polish with program security.
- Do not force-push. Do not merge unless Hamza says merge.
- Use GitHub account `hamzadiaz` for this repo.
- Work on a dedicated git worktree. Do not touch other agents’ branches.
