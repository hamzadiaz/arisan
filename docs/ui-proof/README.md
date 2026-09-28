# UI proof — CLOCK IN mobile shell

390×844 viewport (@2x), Android/Seeker user agent, `next build && next start`, devnet.
Each screen is captured in `dark-*` and `light-*`.

| # | Screen |
|---|--------|
| 01 | Welcome / wallet gate |
| 02 | Connect sheet (Wallet Standard list; MWA + Seeker Connect register here on Android) |
| 03 | Home: next payment + my pools (real devnet pools) |
| 04 | Create pool |
| 05 | Join by invite code (lookup against on-chain hash) |
| 06 / 06b | Active pool: pay CTA, winners, members paid/due |
| 07 | Completed pool: all winners with explorer links |

Connected screens use a **watch-only** Wallet Standard test wallet injected by Playwright.
It exposes a real devnet member address (`Xf2h…1e2Q`) so all data is live on-chain, and it
refuses to sign. The create → invite-once → join → pay screens with real signatures
need a funded devnet wallet on a phone/emulator (the devnet faucet was rate-limited when
these were captured).
