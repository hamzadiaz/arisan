# Art v2 — professional drawing, not clay 3D

Hamza rejected the current assets: “very lame.” Kill the toy clay coins / plastic 3D look.

## Style (mandatory)

**Professional drawing.** Editorial illustration, not a 3D render, not a game asset, not clay, not plastic, not AI-slop orbs.

- Ink + gouache / colored-pencil drawing with **sharp edges**, **solid color**, **real shadows and cast light**, fine detail
- Looks like a high-end financial product illustration someone inked by hand, then colored
- Palette: forest `#047857`, emerald `#10b981`, mint `#a7f3d0`, gold `#d4af37`, espresso `#052e27`, paper ivory `#f4efe6`
- Linework visible. Highlights sharp. No blurry glow, no chrome blobs, no cartoon mascots
- No text, letters, watermarks, fake UI, robots, NFTs, chain-link cubes, skulls, skeleton keys
- Isolated subject, generous padding
- Generate on perfectly flat `#00ff00` chroma. No floor. No backdrop card. Do not use `#00ff00` in the subject.
- After chroma: RGBA, corner alpha 0, green_ratio ~0

## Still icons (replace `public/assets/generated/`)

1. `logo.png` — drawn savings circle: a round pot + ring of coins, readable at 64px, sharp
2. `empty-pools.png` — empty circle, quiet
3. `create-pool.png` — new ring forming
4. `join-code.png` — invite token / ticket coin (drawn, not a metal key)

## Walkthrough animation frames (transparent)

Hamza wants **multi-frame animation**, not a bobbing PNG.

Each scene: **6 frames**, same camera, same drawing, only the action moves. Filenames:

```
public/assets/frames/circle-01.png … circle-06.png
public/assets/frames/pay-01.png … pay-06.png
public/assets/frames/payout-01.png … payout-06.png
public/assets/frames/wallet-01.png … wallet-06.png
```

Scenes:

1. **Circle** — coins/people assembling into a ring
2. **Pay** — coins dropping into the shared pot
3. **Payout** — pot pouring to one person (one hand receiving)
4. **Wallet** — a **phone + wallet**, thumb approving / connecting. **NOT a metal key, NOT “keys.”** This slide was confusing. Motif = you open your own wallet on the phone.

Also stills `walk-circle.png` etc. as frame 03 of each sequence (hero still).

## Copy (Opus)

Last screen title becomes **“Your wallet”** not “Your keys”.
Optional one-liner max: “You sign.”
Keep Skip / Next / Get started. Frame-cycle animation ~8fps, loop, pause on reduced-motion.

Grok writes only `public/assets/**` + `docs/ASSET_MANIFEST.md`.
Opus writes `src/`, e2e, icon script. One PR `feat/clockin-art-v2`. GitHub `hamzadiaz`. No Codex imagegen. No program edits.
