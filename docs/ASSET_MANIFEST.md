# CLOCK IN asset manifest

Ink-and-gouache drawings, 2026-09-29. Flat chroma plates live under `public/assets/chroma/`. The app loads the transparent PNGs (`src/lib/assets.ts`).

Every file is RGBA 1024×1024. Corner alpha is 0. `green_ratio` counts opaque pixels within channel distance 70 of `#00ff00` and is 0 on every file. The backdrop is keyed from the border green, tight enough that forest and emerald paint stays.

Walk stills are frame 03 of each six-frame loop. The circle, pay, and payout loops reuse one drawing and move only the hands or the coins. The wallet loop keeps the phone and the wallet still and moves the hand.

## Stills

| Name | Chroma source | Transparent PNG | Padding (L,T,R,B) |
| --- | --- | --- | --- |
| logo | `public/assets/chroma/logo.png` | `public/assets/generated/logo.png` | 169, 165, 143, 142 |
| empty-pools | `public/assets/chroma/empty-pools.png` | `public/assets/generated/empty-pools.png` | 276, 271, 243, 250 |
| create-pool | `public/assets/chroma/create-pool.png` | `public/assets/generated/create-pool.png` | 196, 205, 160, 201 |
| join-code | `public/assets/chroma/join-code.png` | `public/assets/generated/join-code.png` | 240, 233, 202, 206 |
| walk-circle | `public/assets/chroma/walk-circle.png` | `public/assets/generated/walk-circle.png` | 180, 162, 149, 167 |
| walk-pay | `public/assets/chroma/walk-pay.png` | `public/assets/generated/walk-pay.png` | 306, 150, 280, 92 |
| walk-payout | `public/assets/chroma/walk-payout.png` | `public/assets/generated/walk-payout.png` | 132, 230, 97, 239 |
| walk-wallet | `public/assets/chroma/walk-wallet.png` | `public/assets/generated/walk-wallet.png` | 160, 84, 337, 137 |

## Frames

`public/assets/frames/<scene>-01.png` … `06.png`, with plates in `public/assets/chroma/frames/`.

| Scene | What moves | Hero still |
| --- | --- | --- |
| circle | Four hands, each holding one coin, gather into a ring and ease back open | `walk-circle.png` = `circle-03.png` |
| pay | Three coins drop onto the pot and the column refills from the top | `walk-pay.png` = `pay-03.png` |
| payout | Three coins travel from the pot into one open hand | `walk-payout.png` = `payout-03.png` |
| wallet | A hand taps a phone. A closed wallet sits beside the phone. The phone and wallet do not move | `walk-wallet.png` = `wallet-03.png` |

Subjects: a lidded espresso pot in a wreath of plain coins; a quiet empty ring; a ring of five coins still closing; a notched gold ticket-coin with a green wax seal; hands assembling a circle; coins falling into the pot; coins crossing to one open palm; a phone, a bifold wallet, and a hand approving on the phone.
