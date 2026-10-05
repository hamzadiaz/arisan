# Devnet: the deployed program is older than this repo

Checked 2026-10-05 against `https://api.devnet.solana.com`.

## What's on devnet

- Program `BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6` was last deployed **2025-12-12** (slot 427,830,596).
- Upgrade authority: `CaJpp31WNCQAZPt11BY13Eqyu1vxPnnJYHDyhXmWwud6`.
- The program fixes from 2026-09-28 were never deployed: `aca7d1f` (bound draw: `commit_draw_randomness` + slot-hash winner), `f77e322` (invite code as return data), `1dcca50` (only start full pools).

## What that breaks (live site and `main` alike)

Both point at that address and expect the repo's program (the live bundle contains `commit_draw_randomness`, `member_wallets` and the return-data read):

| Step | On devnet today |
|---|---|
| Create a circle | The transaction lands, but the invite code is only in the program log (`Invite code: …`), not in return data, so the app shows "Couldn't read the invite code". |
| Open a circle | New pools are 187 bytes; the repo's IDL expects the roster and draw fields, so decoding fails and the app shows "Circle not found". |
| Draw | `commit_draw_randomness` doesn't exist in the deployed program. |

Nothing in the client can fix this. The program has to be upgraded.

## The repo's program, run locally

The repo's program, built from `arisan_contracts/` and loaded into `solana-test-validator` 1.18 at the same address, runs every step through the app's own builders (`src/lib/solana/instructions.ts`, `bound-draw.ts`, `scheduler.ts`):

- create (the invite code comes back as return data), join ×2, stake ×2, start, pay ×2;
- a draw (commit by a non-host after the deadline, then execute with the slot-hash winner; the winner receives the pot) for both rounds;
- claim_stake_refund, refund_all_stakes (the vault ends at 0);
- auto circles: the join takes the stake, leaving refunds it, the circle starts when full, and the scheduler marks an unpaid seat before it draws;
- the redesigned UI end to end, with two wallets that really sign (`e2e/chain.spec.ts`).

Logs: `docs/bezel/onchain.log` (25 of 25 steps, three circles) and `docs/bezel/chain-ui.log`.

## Build (verified)

A plain `cargo build-sbf` with Solana 1.18 fails on this lockfile: `base64ct 1.8.3` and `test-case-macros 3.4.0` need Rust's 2024 edition, `borsh 1.6` needs rustc 1.77 and `indexmap 2.12` needs 1.82. What builds, in the Anchor 0.30.1 image, on a scratch copy:

```sh
docker run --rm -v "$PWD/arisan_contracts:/src:ro" -v "$PWD/out:/out" backpackapp/build:v0.30.1 bash -lc '
  rustup toolchain install 1.86.0 --profile minimal && rustup default 1.86.0   # cargo metadata reads 2024-edition manifests
  cp -r /src /work && cd /work
  cargo update -p base64ct --precise 1.6.0                                    # the one 2024-edition crate in the program build
  sed -i "s/^version = 4$/version = 3/" Cargo.lock                            # the SBF toolchain reads lockfile v3
  cargo build-sbf --tools-version v1.47 --manifest-path programs/arisan_contracts/Cargo.toml
  cp target/deploy/arisan_contracts.so /out/'
```

Result: `arisan_contracts.so`, 462,056 bytes.

## Deploy (needs the upgrade authority's key)

The new binary is bigger than the program account: the current program data holds 416,448 bytes, the new one needs 462,056. Extend first, then deploy:

```sh
solana config set -u devnet -k <upgrade-authority keypair>
solana program extend BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6 50000
solana program deploy --program-id BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6 out/arisan_contracts.so
```

Budget about 4 devnet SOL in that wallet: the extension's rent (about 0.35 SOL) and a temporary write buffer (about 3.2 SOL, returned when the deploy finishes).

After the upgrade, pools created by the old program (187-byte accounts) can't be used by the new program or the app; the app skips them as old format. They only hold devnet SOL.

## Check it afterwards

```sh
node scripts/check-program.cjs https://api.devnet.solana.com <any new pool address>
```

It prints the deploy slot and authority, whether the binary has `commit_draw_randomness`, and whether a pool decodes with the repo's IDL. Read-only.

## Run the UI against the repo's program locally

```sh
docker run -d --name arisan-validator -p 127.0.0.1:18899:8899 -p 127.0.0.1:18900:8900 -v "$PWD/out:/prog:ro" \
  backpackapp/build:v0.30.1 bash -lc "solana-test-validator --reset --ledger /tmp/ledger --bind-address 0.0.0.0 \
  --bpf-program BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6 /prog/arisan_contracts.so --quiet"
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:18899 npx next build && npx next start -p 3121
CHAIN_RPC=http://127.0.0.1:18899 PW_NO_SERVER=1 E2E_PORT=3121 npx playwright test e2e/chain.spec.ts
```

Two browsers with wallets that sign for real run a whole two-seat circle: about 13 minutes, because rounds are 5 minutes on-chain.
