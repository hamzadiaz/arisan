# UI proof — mobile shell

390×844 @2x, `next build && next start`, `dark-*` and `light-*` for each screen.

| # | Screen |
|---|--------|
| 01 | Welcome (disconnected) |
| 02 | Home: next draw + pools |
| 03 / 03b | Active pool: pay, winners, members paid/due |
| 04 | Create |
| 05 | Join: code lookup |

Regenerate:

```sh
UI_PROOF=1 npx playwright test e2e/ui-proof.spec.ts
```

Connected screens (02, 03) use a watch-only Wallet Standard wallet that refuses to sign,
against a mocked RPC serving Borsh-encoded Pool / Member / Payment / Draw accounts. Real
signatures (create → invite → join → pay) need a funded devnet wallet on a device.
