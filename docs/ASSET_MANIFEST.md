# CLOCK IN asset manifest

Generated 2026-09-29 with Grok image generation. Chroma sources are the flat-green plates. Keyed files are the ones the app loads (`src/lib/assets.ts`).

Keying samples the border green and clears every pixel within a tight distance of that green, including backdrop trapped inside a ring. `empty-pools` uses a tighter distance so the enamel band stays solid. Every keyed file is RGBA 1024×1024. Corner alpha is 0. `green_ratio` counts opaque pixels within channel distance 70 of `#00ff00`; it is 0 on all eight.

| Name | Chroma source | Transparent PNG | Min padding (L,T,R,B) |
| --- | --- | --- | --- |
| logo | `public/assets/chroma/logo.png` | `public/assets/generated/logo.png` | 135, 202, 133, 201 |
| walk-circle | `public/assets/chroma/walk-circle.png` | `public/assets/generated/walk-circle.png` | 165, 220, 136, 216 |
| walk-pay | `public/assets/chroma/walk-pay.png` | `public/assets/generated/walk-pay.png` | 356, 150, 350, 191 |
| walk-payout | `public/assets/chroma/walk-payout.png` | `public/assets/generated/walk-payout.png` | 128, 172, 124, 194 |
| walk-wallet | `public/assets/chroma/walk-wallet.png` | `public/assets/generated/walk-wallet.png` | 242, 236, 238, 199 |
| empty-pools | `public/assets/chroma/empty-pools.png` | `public/assets/generated/empty-pools.png` | 267, 241, 266, 241 |
| create-pool | `public/assets/chroma/create-pool.png` | `public/assets/generated/create-pool.png` | 226, 207, 207, 202 |
| join-code | `public/assets/chroma/join-code.png` | `public/assets/generated/join-code.png` | 178, 194, 166, 175 |

Contact sheet: `docs/ui-proof/asset-montage.png` (dark `#030706`).

Subjects: gold and mint coins around an espresso pot; a circle of figures holding coins; coins falling into the pot; the pot tipping toward one figure; an emerald vault stone with a keyhole and key; an empty ring; a ring still closing; a notched gold invite token.

`walk-wallet` and `create-pool` carry more gold filigree than the ceramic pot. The logo’s coins form an open orbit rather than a closed geometric circle.
