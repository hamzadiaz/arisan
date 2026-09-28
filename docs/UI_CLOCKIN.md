# Arisan UI — CLOCK IN / Seeker brief

Hamza wants a **mobile-first Seeker app**, not a shadcn dashboard that happens to resize.

## Product loop on a phone

1. Language-optional, wallet-first. Connect Seed Vault / Phantom / Solflare via Seeker Connect + MWA.
2. Home: my pools, next payment due, one primary CTA **Create pool** / **Join**.
3. Create: name, members (2–20), monthly amount, SOL or USDC, stake on/off. Show invite code **once**.
4. Join: paste code, see amount, confirm wallet tx.
5. Pool: members, round, countdown, Pay, Draw (only when allowed).
6. Result: winner + explorer link. No “NFT minted”.

## UX rules (Optijara / Hamza)

- Phone-first, max width ~480px, safe-area, fixed bottom nav if needed
- Little prose. Cards, amounts, countdowns, one primary button
- Dark/light that actually works (Tailwind v4 class strategy)
- No desktop sidebar as the only nav
- No Stripe, no “create custodial wallet”, no Google-as-primary
- No fake leaderboards
- Real tx toasts with explorer links
- Arabic/English not required for CLOCK IN; English-first is fine
- Visual proof: public or local mobile viewport screenshots in the PR (`docs/ui-proof/`)

## Existing UI to reuse, not clone-from-scratch

Next.js 16 + Tailwind 4 + Radix + Framer Motion already in the repo:

- `src/app/page.tsx` landing
- `src/app/dashboard/*`
- `src/app/pools/*`
- `src/components/providers/solana-provider.tsx`
- `src/hooks/use-solana-program.ts`

Rewrite the **shell** to feel like a native mobile savings circle. Keep the Solana hooks.

## Seeker Connect

Add wallet standard / Seeker Connect for web. Do not rebuild in React Native for this deadline. Wrap later with `solana-mobile webshell` for the APK (can be a follow-up PR).

## Out of scope for the UI PR

- Program instruction changes (that is the security PR)
- Stripe
- Custodial API
- NFT / FoodDex
