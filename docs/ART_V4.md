> Superseded on `main` by the full-screen canvas walkthrough (`jackpot-scene.tsx`, PR #22). Unique-frame hashes and FrameCycle are not used at runtime.

# Art v4 — real walkthrough animation (consecrated gold)

Hamza 2026-09-29: v3 gold coin + emerald ring is **the style**. Keep it. Do not invent a new look.

Bugs:
- All 6 frames per scene are **byte-identical**. Walkthrough cannot animate.
- Bad backgrounds / chewed chroma cuts
- Need **visible motion** on every walkthrough screen

Opus 5.5 = mastermind (spec, FrameCycle, e2e). Grok = pixels only.

## Locked style

Reference stills (do not restyle):
`public/assets/generated/logo.png` (one gold coin, emerald ring) — **keep**
Same metal `#D4AF37` / `#C9A227` on **every** coin. Emerald glass ring only.
Floating cinematic 3D hybrid (PurrCat/Mrya cut). **No baked shadow, no floor, no card, no paper texture, no green fringe.**
Flat `#00ff00` chroma. Glow in CSS only.

## Animation (6 DISTINCT frames each)

Same camera, same lighting, same gold. Only pose changes. SHA256 of frames in a scene **must all differ**.

### circle (Form a circle)
1. three gold coins apart
2. coins drifting into an arc
3. five-coin horseshoe
4. almost-closed ring
5. closed ring, tiny gap
6. tight gold ring (matches walk-circle still)

### pay (Everyone pays in)
1. emerald bowl empty, one gold coin above
2. coin falling
3. coin entering bowl
4. two coins in, one falling
5. three coins in bowl
6. settled pile (matches walk-pay still)

### payout (One takes the pot)
1. pile of identical gold coins
2. top coin lifts
3. coin rising, pile stays
4. coin closer to camera
5. coin large, centered
6. one coin forward (matches walk-payout still)

### wallet (Your wallet)
1. phone + gold coin beside
2. coin sliding onto phone
3. coin on screen
4. soft emerald confirm glow (no text)
5. coin settling
6. rest (matches walk-wallet still)

Files: `public/assets/frames/<scene>-01.png` … `-06.png`
Stills: `public/assets/generated/walk-<scene>.png` = frame 06 (or 03 if it reads better).

## Opus

- Write/keep `docs/ANIMATION_SPEC.md` with this shot list
- FrameCycle must play when hashes differ; if decode fails, do not silently freeze on still
- Playwright: assert at least 2 unique frame URLs requested, or `data-playing=true`
- Do not regenerate the logo
- PR `feat/clockin-art-v4` when Grok’s frames are unique. Do not merge until Hamza says.

## Grok

One frame at a time. After each scene, `shasum` all six — if any collide, regenerate the duplicate. Chroma helper with `--despill`. Gray preview. No Codex if rate-limited; Grok image_gen is fine.
