# Devnet: the app's program

Checked 2026-10-05 against `https://api.devnet.solana.com`.

## What's on devnet

- Since `698cbc3` (5 Oct) the app points at `Aw54KXqUyccCACmmry5MmCmTzqJqKfmnL868aMpJaGbB`, which Hamza deployed from `main` at `fc0abe4` (PR #23 included), slot 507,819,846. Upgrade authority `AMrVdasczrafDFiF3YgYNtNeEw6vvURzrK1AipP3bPnW`; the program data holds 479,624 bytes.
- Not on it yet: the `execute_draw` follow-up (`44ca78d`: removed seats don't hold the draw, and a circle completes once no one left can win). The app on `main` already follows that rule, so upgrade the program before, or with, the next site deploy (see Upgrade). With the app ahead of the program, a circle with a removed seat would commit a draw the program then refuses, and an unfinished commit locks the circle. A removal needs a 48-hour grace first.
- The previous program, `BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6` (last deployed 2025-12-12, authority `CaJpp31WNCQAZPt11BY13Eqyu1vxPnnJYHDyhXmWwud6`), stays on chain and the app no longer uses it. It predated the 2026-09-28 fixes (`aca7d1f` bound draw, `f77e322` invite code as return data, `1dcca50` only start full pools): against it the app could create a circle but not read it back, show its invite code or draw.

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

Result: `arisan_contracts.so`, 477,496 bytes (`main` with PR #23 and the follow-up; 462,056 before them). The same image runs the program tests with stable Rust (`rustup toolchain install stable`, then `RUST_LOG=off cargo +stable test -p arisan_contracts --test security_p0 -- --test-threads=1`): 10 passed, 1 ignored (P-2).

## Upgrade (needs the upgrade authority's key)

Build from `main` (the program ID comes from `declare_id!`, so build after `698cbc3`). The follow-up build is 477,496 bytes, under the 479,624 the program data holds, so no extend is needed:

```sh
solana config set -u devnet -k <upgrade-authority keypair>
solana program deploy --program-id Aw54KXqUyccCACmmry5MmCmTzqJqKfmnL868aMpJaGbB out/arisan_contracts.so
```

Budget about 3.5 devnet SOL in that wallet for the temporary write buffer (returned when the deploy finishes). No account layout changes, so circles made before the upgrade keep working.

## Check it afterwards

```sh
node scripts/check-program.cjs https://api.devnet.solana.com <any new pool address>
```

It prints the deploy slot and authority, whether the binary has `commit_draw_randomness`, and whether a pool decodes with the repo's IDL. Read-only.

## Run the UI against the repo's program locally

```sh
docker run -d --name arisan-validator -p 127.0.0.1:18899:8899 -p 127.0.0.1:18900:8900 -v "$PWD/out:/prog:ro" \
  backpackapp/build:v0.30.1 bash -lc "solana-test-validator --reset --ledger /tmp/ledger --bind-address 0.0.0.0 \
  --bpf-program Aw54KXqUyccCACmmry5MmCmTzqJqKfmnL868aMpJaGbB /prog/arisan_contracts.so --quiet"
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:18899 npx next build && npx next start -p 3121
CHAIN_RPC=http://127.0.0.1:18899 PW_NO_SERVER=1 E2E_PORT=3121 npx playwright test e2e/chain.spec.ts
```

Two browsers with wallets that sign for real run a whole two-seat circle: about 13 minutes, because rounds are 5 minutes on-chain.
