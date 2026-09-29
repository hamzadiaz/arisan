# CLOCK IN asset manifest

Gold-and-emerald stills, 2026-09-29. Flat chroma plates live under `public/assets/chroma/`. The app loads the transparent PNGs (`src/lib/assets.ts`).

Every file is RGBA 1024×1024. Corner alpha is 0. `green_ratio` counts opaque pixels within channel distance 70 of `#00ff00`. Bright emerald highlights can sit near that green, so the ratio is under about 0.001 rather than exactly 0. There is no floor and no contact shadow in the PNG. Glow belongs in CSS.

The logo is one polished gold coin with an emerald glass ring. Every other coin uses that same gold. Walkthrough frames are six distinct poses per scene, per `docs/ANIMATION_SPEC.md`.

## Stills

| Name | Chroma source | Transparent PNG | Padding (L,T,R,B) |
| --- | --- | --- | --- |
| logo | `public/assets/chroma/logo.png` | `public/assets/generated/logo.png` | 192, 194, 191, 193 |
| empty-pools | `public/assets/chroma/empty-pools.png` | `public/assets/generated/empty-pools.png` | 189, 192, 189, 191 |
| create-pool | `public/assets/chroma/create-pool.png` | `public/assets/generated/create-pool.png` | 198, 206, 201, 200 |
| join-code | `public/assets/chroma/join-code.png` | `public/assets/generated/join-code.png` | 193, 192, 103, 209 |
| walk-circle | `public/assets/chroma/walk-circle.png` | `public/assets/generated/walk-circle.png` | 178, 176, 173, 178 |
| walk-pay | `public/assets/chroma/walk-pay.png` | `public/assets/generated/walk-pay.png` | 280, 247, 280, 292 |
| walk-payout | `public/assets/chroma/walk-payout.png` | `public/assets/generated/walk-payout.png` | 282, 219, 282, 211 |
| walk-wallet | `public/assets/chroma/walk-wallet.png` | `public/assets/generated/walk-wallet.png` | 323, 158, 2, 158 |

## Frames

`public/assets/frames/<scene>-01.png` … `06.png` are six different poses, following the shot list in `docs/ANIMATION_SPEC.md`. `npm run check:frames` fails if any two frames in a scene share a hash. Plates are in `public/assets/chroma/frames/`.

| Scene | Hero still |
| --- | --- |
| circle | `walk-circle.png` |
| pay | `walk-pay.png` |
| payout | `walk-payout.png` |
| wallet | `walk-wallet.png` |

Subjects: one gold coin in an emerald ring; an empty gold-and-emerald ring; a coin with a ring still open; a gold coin with an emerald ticket clasp; eight matching gold coins on an emerald ring; a coin above a ring; a coin lifted off a ring; a phone, that same coin, and a thumb.
