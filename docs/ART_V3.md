# Art v3 — PurrCat / Mrya quality bar

Hamza 2026-09-29: v2 ink drawings are **lame**. Logo **ugly**. Coins **inconsistent colors**. Chroma **cut looks bad** (halos from baked shadows).

Copy the **Cat Translator / Mrya** pipeline (skills: `codex-chroma-app-icons`, `premium-transparent-app-assets`, `mrya-generated-assets`).

## Quality bar (look at these)

- `/Users/hamzadiaz/Projects/cat-translator-ai/app/public/assets/generated/app-icon.png`
- `/Users/hamzadiaz/Projects/mrya/public/images/cube-test/cube.png`

Those are: floating cinematic 3D + hand-painted hybrid, **no contact shadow**, crisp silhouette, one material language, premium.

## Style for Arisan

- Cold, sharp, elegant, still friendly. Not cute clay. Not messy ink. Not sketchy cutouts.
- **Every coin is the same polished gold** `#D4AF37` / `#C9A227`. No mixed copper/brass/pale coins.
- Emerald glass `#047857` / mint `#A7F3D0` only as small accents
- Isolated centered subject, generous padding
- **NO cast shadow, NO contact shadow, NO floor, NO drop shadow in the PNG.** Glow lives in CSS.
- No text, letters, logos, fake UI, robots, NFTs, keys
- Flat solid `#00ff00` background only. Uniform. No lighting on the green.

## Logo (replace the ugly one)

Simple enough to read at **64px**:
**One round gold coin, thin emerald ring around it.** Not a cluttered pot. Not five different coins. One object. Premium iOS icon.

File: `public/assets/generated/logo.png`

## Other stills (same gold, same cut)

`empty-pools.png` `create-pool.png` `join-code.png`
`walk-circle.png` `walk-pay.png` `walk-payout.png` `walk-wallet.png`

Wallet = phone + gold coin, you approve. Not a metal key.

## Frames (optional if stills are perfect)

Keep 6-frame loops only if each frame matches the still’s gold and cut. Same camera. No new shadows.

## Cut pipeline (mandatory)

1. Generate on `#00ff00`
2. Flood-fill border green to exact `#00ff00`
3. `remove_chroma_key.py --auto-key border --soft-matte --despill`
4. PIL: corners alpha 0, green_ratio ~0
5. **Gray-background preview** — if halo/fringe, regenerate, do not ship
6. Subject must be a true cutout (no baked card/floor)

Codex imagegen preferred (PurrCat/Mrya). If Codex is rate-limited, Grok image_gen with **this exact chroma prompt**. Never SVG placeholders.

Commit on `feat/clockin-art-v3`. GitHub `hamzadiaz`. One PR. Do not merge until Hamza sees a montage.
