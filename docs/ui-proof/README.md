# UI proof — Bezel

390×844 @2x, `next build && next start`, `dark-*` and `light-*` for each screen.

| # | Screen |
|---|--------|
| 00-1…4 | First-visit walkthrough (unchanged): Together, Pay in, Jackpot, Your wallet |
| 01 | Welcome (signed out): the dial, Connect wallet, Join with code |
| 02 | Home: next-draw dial and your circles |
| 03 / 03b | Circle: dial with seat numbers, pot / paid / draw, Pay, last result, Seats tab |
| 04 | New circle: the dial previews the seats, ruler, stake |
| 05 | Join: eight-box code, circle found |

The dial is Three.js. Pages load with `?dial=3d` so the proof shows it on any machine; without
the flag, software WebGL (CI) keeps the SVG dial: the same glass colours and seat marks, drawn flat.

Regenerate:

```sh
UI_PROOF=1 npx playwright test e2e/ui-proof.spec.ts
```

Connected screens (02, 03) use a watch-only Wallet Standard wallet that refuses to sign,
against a mocked RPC serving Borsh-encoded Pool / Member / Payment / Draw accounts. Real
signatures (create → invite → join → pay) need a funded devnet wallet on a device.
