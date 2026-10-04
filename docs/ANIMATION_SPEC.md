> Superseded on `main` by the full-screen canvas walkthrough (`jackpot-scene.tsx`, PR #22). Unique-frame hashes and FrameCycle are not used at runtime.

# Walkthrough animation spec

Source brief: `docs/ART_V4.md` (2026-09-29). Style is locked by v3 (`docs/ART_V3.md`). This file is the shot list Grok draws to and the contract `FrameCycle` and the e2e gate enforce.

## Locked style (do not restyle)

- Reference: `public/assets/generated/logo.png`, one polished gold coin in a thin emerald glass ring. Never regenerate it.
- Every coin is the same gold, `#D4AF37` body, `#C9A227` rim and shade. No copper, brass or pale coins.
- Emerald glass `#047857` and mint `#A7F3D0` only for the ring, bowl and confirm glow.
- A floating cinematic 3D hybrid (the PurrCat/Mrya cut). **No** baked shadow, contact shadow, floor, card, paper texture, text or green fringe.
- Generated on flat `#00ff00`. Glow lives in CSS, never in the PNG.

## Camera and canvas (identical for all six frames of a scene)

- 1024×1024 RGBA with corner alpha 0.
- Camera, lens, angle and key light match that scene's current `walk-<scene>.png`. Don't invent a new camera. Frame 06 is the still's pose.
- The subject is centered and never crosses the still's padding box (`docs/ASSET_MANIFEST.md`), so the loop never jumps in the 288px `size-72` box.
- **Only the pose changes between frames.** Coin size, gold, ring thickness and lighting stay fixed, except for the deliberate scale change in `payout` 04–06.

## Shot list

Positions are approximate, as a percentage of the canvas from the top-left.

### circle: "Form a circle" (still: `walk-circle.png`)

| # | Coins | Pose |
| --- | --- | --- |
| 01 | 3 | Three gold coins far apart, loose triangle around the center (~25%/50%, 50%/25%, 75%/55%) |
| 02 | 3–4 | Coins drift inward along an arc, a fourth entering from the edge |
| 03 | 5 | Five-coin horseshoe, open at the bottom |
| 04 | 6–7 | Almost-closed ring, one coin-width gap |
| 05 | 8 | Closed ring with a tiny gap |
| 06 | 8 | Tight gold ring, matches `walk-circle.png` |

### pay: "Everyone pays in" (still: `walk-pay.png`)

| # | Coins in bowl | Pose |
| --- | --- | --- |
| 01 | 0 | Emerald glass bowl, empty, lower center. One gold coin hovers above (~50%/20%) |
| 02 | 0 | That coin falling, about halfway down |
| 03 | 0→1 | Coin entering the bowl rim |
| 04 | 2 | Two coins in, a third falling above |
| 05 | 3 | Three coins in the bowl |
| 06 | pile | Settled pile, matches `walk-pay.png` |

### payout: "One takes the pot" (still: `walk-payout.png`)

| # | Pose |
| --- | --- |
| 01 | Pile of identical gold coins, lower center |
| 02 | Top coin lifts slightly off the pile |
| 03 | Coin rising, pile unchanged |
| 04 | Coin closer to camera (larger), pile unchanged |
| 05 | Coin large and centered |
| 06 | One coin forward, matches `walk-payout.png` |

### wallet: "Your wallet" (still: `walk-wallet.png`)

| # | Pose |
| --- | --- |
| 01 | Phone with one gold coin beside it |
| 02 | Coin sliding onto the phone |
| 03 | Coin on the screen |
| 04 | Soft emerald confirm glow on the screen, **no text or UI** |
| 05 | Coin settling |
| 06 | Rest, matches `walk-wallet.png` |

## Files

- Frames: `public/assets/frames/<scene>-01.png` … `-06.png`
- Plates: `public/assets/chroma/frames/<scene>-0N.png`
- Stills: `public/assets/generated/walk-<scene>.png` is frame 06 (or 03 if it reads better). The still may be byte-identical to that frame. Uniqueness is required only among the six frames.

## Cut pipeline (per frame, from ART_V3)

1. Generate on `#00ff00`, one frame at a time.
2. Flood-fill the border green to exact `#00ff00`.
3. `remove_chroma_key.py --auto-key border --soft-matte --despill`
4. PIL check: corners alpha 0, `green_ratio` under ~0.001.
5. Gray-background preview. If there's a halo or fringe, regenerate. Don't ship it.

## Acceptance

1. `npm run check:frames` exits 0: six files per scene, six different SHA-256 hashes. Run it after every scene and regenerate any duplicate.
2. `npx playwright test e2e/walkthrough.spec.ts` is green, including `shipped <scene> frames are six distinct images`.
3. A gray-preview montage of all 24 frames reads as motion, with the same gold throughout.

## Runtime contract (`src/components/mobile/frame-cycle.tsx`)

`FrameCycle` shows the still until all six frames have been fetched and decoded, then loops them at 8 fps. It never loops frames that can't move. Its state is on the `<img>` as `data-frame-state`:

| State | Shows | Meaning |
| --- | --- | --- |
| `loading` | still | Frames are still fetching |
| `playing` | frames | All six loaded, decoded and pairwise different |
| `duplicate` | still | Two or more frames are the same bytes. This is an art bug, logged with `console.error` |
| `decode-failed` | still | A frame is missing or won't decode, logged with `console.error` |
| `reduced-motion` | still | The viewer prefers reduced motion |

`data-playing` is `true` only in `playing`.
