# Walkthrough cinema — Opus 5.5 leads

Hamza 2026-09-29: current walkthrough is **ugly**. PNG flipbook is not animation. Icons are bad. Missing background. Missing the story.

**Opus 5.5 is the mastermind.** You build motion that actually plays in the browser. Grok only supplies sprites/video if you ask.

## What it must feel like

A full-screen **cinematic intro**, not a title + 288px icon on empty cream.

Story (4 beats, one screen each):

1. **Together** — gold coins drift in from the edges and form a circle (people pooling money)
2. **Pay in** — coins fall into a shared pot / bowl
3. **Jackpot** — the pot bursts; **one** coin flies forward (one person takes the round)
4. **Your wallet** — that coin lands on a phone; you approve. No metal keys.

Background: full-bleed dark espresso → emerald. **Animated** gold dust / soft light. Glass/transparent UI (Skip, title, Next) over the scene. Mix-blend / opacity, not a white card.

The motion **must be visible in 1 second**. Canvas, WebGL, or framer-motion SVG/div coins. **Do not** depend on 6 nearly-identical PNGs.

Reduced motion: freeze on a nice still.

Keep copy tiny: Together / Pay in / Jackpot / Your wallet.

## Icons (Grok)

Hamza hates the current generated icons. New set, PurrCat/Mrya cut quality:

- `logo.png` — **one** gold coin, thin emerald ring, readable at 64px, no clutter
- `empty-pools.png` `create-pool.png` `join-code.png` — same gold, same cut
- Chroma `#00ff00`, **no baked shadow/floor/card**, `--despill`, gray preview
- Every coin `#D4AF37`

If Grok video (imagine) can give a short loop for the background, Opus may overlay it with mix-blend. If video has no alpha, treat it as a background plate under the canvas coins. Do not block the walkthrough on video.

## Opus owns

`src/components/onboarding/**`, walkthrough.tsx, e2e. Kill FrameCycle as the hero. Ship a `JackpotScene` (or similar) that animates for real. Playwright: assert `canvas` or moving nodes, not just a title.

Branch `feat/clockin-walk-cinema`. PR against main. Do not merge. GitHub `hamzadiaz`.

Do not touch Rust programs. Do not re-enable Stripe.
