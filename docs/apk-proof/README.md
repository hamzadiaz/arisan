# APK proof: Android emulator, real Mobile Wallet Adapter, real transactions

Run on 2026-09-29. Nothing below is mocked: a signed release APK, the MWA `fakewallet`, and a validator running `main`'s program. The commands are in [`docs/APK.md`](../APK.md).

| | |
|---|---|
| APK | `dist/arisan-clockin-0.1.0.apk` from `./scripts/build-apk.sh`; `com.arisan.clockin` v0.1.0 (1), minSdk 28, targetSdk 37, 2.1 MB; `apksigner verify` passes |
| Built with | `solana-mobile@0.5.0 webshell build`, JDK 21, Android build-tools 36.1.0 |
| Device | Android emulator, API 36.1 arm64 (`Medium_Phone`, read-only), WebView 145 |
| Wallet | `fakewallet` (MWA test wallet, installed with `solana-mobile device install fakewallet`), seed account `CVb41PtNg5sJhCzcneid6dpKrqq215qAJnJxx8yn8UnE` |
| Chain | `solana-test-validator` 3.0.15 with `main`'s program (`cargo build-sbf`) at `BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6` |
| Web app | `next start` on the host with `NEXT_PUBLIC_SOLANA_RPC_URL=http://localhost:8899`, reached from the device via `adb reverse` |

## Flow

| Step | Screenshot | Result |
|---|---|---|
| Launch | `01-launch-home.png` | The app loads inside the shell; the header shows brand, theme toggle and Connect |
| Connect | `02-wallet-sheet.png` | The sheet lists **Mobile Wallet Adapter · Detected** |
| MWA authorize | `03-fakewallet-authorize.png` | fakewallet shows "Authorize dapp: Arisan, localhost:3107", verification successful. This shot is from the first connect, while the app still targeted devnet, so it reads `Cluster: devnet`; the localnet re-authorization showed `solana:localnet` |
| Connected | `04-connected-home.png` | The header shows the wallet chip; Home shows "Pools · No pools yet" |
| Create | `05-create-form.png` | "APK local test", 0.01 SOL, 2 members, no stake |
| Sign | `06-fakewallet-sign.png` | fakewallet signs 1 payload and sends it to the cluster |
| Created | `07-pool-created-invite.png` | "Pool Created!", invite **L56NLFGY**, "Shown once" |
| Pool | `08-pool-detail.png` | "0 of 2 joined", 0.02 SOL pot |
| Join lookup | `09-join-found.png` | The typed `l56nlfgy` is normalized and matches "APK local test" |
| Joined | `10-joined-pool.png` | "1 of 2 joined", member "You", Start reads "Waiting for members (1/2)" |

## On-chain verification (after the create)
```
tx 4tUS2QH7hZZ9iBqcTyHnCQxvMsbEBGi52aAVVRYhEysWRudWenLUVv191wmGE261BCoYviNUdhUsS339gxrdqhfp  err: null
pool DciEEMDWWV916CgaGTc3FLqcN7xdv8Weihr3V9aRTxtG  owner BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6
name APK local test  max 2  lamports/round 10000000  status Pending
hash matches L56NLFGY: true
plaintext in account: false
```

## Bugs found while doing this (fixed in the same PR)
- **E2E-15:** `@solana-mobile/wallet-standard-mobile` 0.4.4 refuses to register MWA inside any WebView, so the APK showed "You'll need a wallet". Upgraded to 0.6.0, which allows the `Solana Mobile Web Shell` user agent.
- **E2E-16:** MWA registered in a `useEffect` that ran after the wallet provider's registry snapshot and before its subscription, so the registration was lost. Android Chrome hid this, because there the adapter adds its own legacy MWA adapter. Registration now happens at module load. Regression test: `e2e/webshell.spec.ts`.
- The E2E gate built into `.next` and clobbered a running build. It now builds into `.next-e2e`.

## Not proven here
- **First-visit walkthrough (#16):** it merged after this run. The APK was rebuilt with the new icons, but the walkthrough (swipe exit, first-visit flag in `localStorage`) has only been exercised in desktop Chromium by the E2E gate, not inside the WebView.
- **Funding note:** the fakewallet account was funded with 0.5 **devnet** SOL from `~/.config/solana/id.json` (6.29 → 5.79). The emulator ran read-only, so that seed is gone and the devnet SOL can't be recovered. It has no value, but it was spent.
- **Devnet:** not proven. One create attempt against devnet did not land, most likely from the same blockhash expiry (the sign screen was left open too long). Separately, the devnet program is the pre-security build: it has no `commit_draw_randomness`, so draws can't run, and its Pool layout predates the app's IDL. It needs a redeploy (see `docs/APK.md`).
- **Real device / Seed Vault:** tested on an emulator with `fakewallet`, not on a Seeker with Seed Vault.
- **Hosted https URL:** the APK here points at `http://localhost:3107` via `adb reverse`. A distributable APK needs a hosted https deployment; see the production checklist in `docs/APK.md`.
