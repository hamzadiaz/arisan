# CLOCK IN asset manifest

Gold-and-emerald stills, 2026-09-29. Flat chroma plates live under `public/assets/chroma/`. The app loads the transparent PNGs (`src/lib/assets.ts`).

Every file is RGBA 1024×1024. Corner alpha is 0. `green_ratio` counts opaque pixels within channel distance 70 of `#00ff00`. Bright emerald highlights can sit near that green, so the ratio is under about 0.001 rather than exactly 0. There is no floor and no contact shadow in the PNG. Glow belongs in CSS.

The logo is one polished gold coin with a thin emerald glass ring. `empty-pools`, `create-pool`, and `join-code` were recut from that coin on 2026-09-29. Every coin uses the same gold. Gray check: `docs/ui-proof/icon-gray-preview.png`. A still backdrop, espresso into emerald with gold dust, is `public/assets/generated/cinema-bg.jpg` (720×1280, no alpha). There is no looping video.

The walkthrough has no art files. It is drawn in code on one canvas by `src/components/onboarding/jackpot-scene.tsx`.

## Stills

| Name | Chroma source | Transparent PNG | Padding (L,T,R,B) |
| --- | --- | --- | --- |
| logo | `public/assets/chroma/logo.png` | `public/assets/generated/logo.png` | 177, 179, 177, 179 |
| empty-pools | `public/assets/chroma/empty-pools.png` | `public/assets/generated/empty-pools.png` | 177, 179, 177, 179 |
| create-pool | `public/assets/chroma/create-pool.png` | `public/assets/generated/create-pool.png` | 127, 139, 127, 128 |
| join-code | `public/assets/chroma/join-code.png` | `public/assets/generated/join-code.png` | 154, 244, 73, 244 |

Subjects: one gold coin in a thin emerald ring; an empty gold-and-emerald ring; a gold coin inside an open ring; a gold coin beside an opaque emerald ticket.
