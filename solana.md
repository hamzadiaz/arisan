# Solana Development Setup Guide

## Latest Versions (December 2025)

| Tool | Version | Notes |
|------|---------|-------|
| Solana CLI | 3.0.10 / 3.1.4 | Via Agave (anza-xyz) |
| Anchor | 0.32.1 | Latest stable |
| Rust | 1.91.1 | Minimum: 1.75.0 |
| Node.js | 24.x | For client-side |

---

## Quick Install (All-in-One)

Install Rust, Solana CLI, and Anchor with a single command:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

After installation, restart your terminal or run:
```bash
source ~/.bashrc   # Linux
source ~/.zshrc    # macOS (zsh)
```

---

## Manual Installation

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup default stable
rustup update
```

Verify:
```bash
rustc --version
# Expected: rustc 1.91.1 or newer
```

### 2. Install Solana CLI (via Agave)

```bash
# Install latest stable
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Or specific version
sh -c "$(curl -sSfL https://release.anza.xyz/v3.0.10/install)"
```

Add to PATH (add to ~/.zshrc or ~/.bashrc):
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Verify:
```bash
solana --version
# Expected: solana-cli 3.0.10 or newer
```

### 3. Install Anchor (via AVM)

```bash
# Install AVM (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --force

# Install latest Anchor
avm install latest
avm use latest
```

Add AVM to PATH (add to ~/.zshrc or ~/.bashrc):
```bash
export PATH="$HOME/.avm/bin:$PATH"
```

Verify:
```bash
anchor --version
# Expected: anchor-cli 0.32.1
```

---

## Configuration

### Set Solana Network

```bash
# Devnet (for testing)
solana config set --url devnet

# Testnet
solana config set --url testnet

# Mainnet
solana config set --url mainnet-beta

# Local (localhost)
solana config set --url localhost
```

### Create/Import Wallet

```bash
# Create new keypair
solana-keygen new -o ~/.config/solana/id.json

# Or recover from seed phrase
solana-keygen recover -o ~/.config/solana/id.json

# Set as default
solana config set --keypair ~/.config/solana/id.json
```

### Get Devnet SOL (for testing)

```bash
solana airdrop 2
# or
solana airdrop 2 <WALLET_ADDRESS>
```

### Check Configuration

```bash
solana config get
```

---

## Anchor Project Commands

### Initialize New Project

```bash
anchor init my_project
cd my_project
```

### Build Program

```bash
anchor build
```

Output:
- `target/deploy/<program_name>.so` - Compiled program
- `target/idl/<program_name>.json` - IDL file
- `target/types/<program_name>.ts` - TypeScript types

### Get Program ID

```bash
solana address -k target/deploy/arisan_contracts-keypair.json
```

### Update Program ID in Code

After getting program ID, update:
1. `programs/<name>/src/lib.rs` - `declare_id!("...")`
2. `Anchor.toml` - `[programs.devnet]` section

### Deploy Program

```bash
# Deploy to configured network
anchor deploy

# Deploy to specific network
anchor deploy --provider.cluster devnet
```

### Upgrade Program (redeploy)

```bash
anchor upgrade target/deploy/<program_name>.so --program-id <PROGRAM_ID>
```

---

## Testing

### Run Anchor Tests

```bash
anchor test
```

### Run Tests Without Deploy

```bash
anchor test --skip-deploy
```

### Run Specific Test File

```bash
anchor test tests/my_test.ts
```

### Local Validator Testing

```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Run tests against local
anchor test --skip-local-validator
```

---

## Common Commands Reference

### Wallet Commands

```bash
# Check balance
solana balance

# Check specific address
solana balance <ADDRESS>

# Transfer SOL
solana transfer <RECIPIENT> <AMOUNT>

# Show wallet address
solana address
```

### Program Commands

```bash
# List deployed programs
solana program show --programs

# Show program details
solana program show <PROGRAM_ID>

# Close program (recover SOL)
solana program close <PROGRAM_ID>
```

### Account Commands

```bash
# Get account info
solana account <ADDRESS>

# Get account data (base64)
solana account <ADDRESS> --output json
```

---

## Troubleshooting

### "Anchor version not set"

```bash
avm list              # List installed versions
avm install 0.32.1    # Install specific version
avm use 0.32.1        # Set active version
```

### "Command not found: anchor"

Add to your shell profile (~/.zshrc or ~/.bashrc):
```bash
export PATH="$HOME/.avm/bin:$PATH"
```

Then reload:
```bash
source ~/.zshrc
```

### "Command not found: solana"

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
source ~/.zshrc
```

### Build Fails - Rust Version

```bash
rustup default stable
rustup update
```

### Insufficient Funds for Deploy

Devnet airdrops are limited. Try:
```bash
solana airdrop 2
# Wait a few seconds between airdrops
solana airdrop 2
```

Or use the faucet: https://faucet.solana.com

### Program Too Large

If program exceeds size limit:
```bash
# Extend program account
solana program extend <PROGRAM_ID> <ADDITIONAL_BYTES>
```

---

## Project Structure (Anchor)

```
my_project/
├── Anchor.toml           # Project config
├── Cargo.toml            # Rust workspace
├── programs/
│   └── my_program/
│       ├── Cargo.toml    # Program dependencies
│       └── src/
│           └── lib.rs    # Program code
├── tests/
│   └── my_program.ts     # TypeScript tests
├── migrations/
│   └── deploy.ts         # Deploy scripts
└── target/
    ├── deploy/           # Compiled .so files
    ├── idl/              # IDL JSON files
    └── types/            # Generated TS types
```

---

## Useful Links

- [Solana Docs](https://solana.com/docs)
- [Anchor Docs](https://www.anchor-lang.com/docs)
- [Solana CLI Reference](https://docs.anza.xyz/cli)
- [Solana Cookbook](https://solanacookbook.com)
- [Anchor GitHub](https://github.com/solana-foundation/anchor)
- [Agave Releases](https://github.com/anza-xyz/agave/releases)

---

## For This Project (Arisan)

### Build

```bash
cd arisan_contracts
anchor build
```

### Deploy to Devnet

```bash
solana config set --url devnet
anchor deploy
```

### Copy IDL to Frontend

```bash
cp target/idl/arisan_contracts.json ../src/lib/solana/idl.json
```

### Program ID

```
BjxGBSpEULzq9kJfx3bGB1rpVHwta8QuP2jeVKow3wN6
```

---

## SHA256 Hashed Invite Codes (Dec 2025)

Invite codes are now stored as SHA256 hashes on-chain for security. The plaintext code is only shown once at pool creation.

### How It Works

1. **Create Pool**: Contract generates 8-char alphanumeric code, hashes it with SHA256, stores hash on-chain
2. **Join Pool**: User enters plaintext code, contract hashes input, compares to stored hash
3. **Security**: Hash is one-way - cannot extract invite code from blockchain data

### Build & Deploy Steps

```bash
# 1. Build contract (with IDL generation)
cd arisan_contracts
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
anchor build

# 2. Check wallet balance (need ~3 SOL for deploy)
solana balance --url devnet

# 3. Airdrop if needed
solana airdrop 2 --url devnet

# 4. Deploy to devnet
solana program deploy target/deploy/arisan_contracts.so --url devnet

# 5. Copy IDL to frontend
cp target/idl/arisan_contracts.json ../src/lib/solana/idl.json
```

### Run Hashed Invite Codes Test

```bash
cd arisan_contracts
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/devnet.json
npx tsx tests/hashed_invite_test.ts
```

Expected output:
```
========================================
   SHA256 HASHED INVITE CODES TEST
========================================
...
✅ Pool created with SHA256 hashed invite code
✅ Invite code captured from transaction logs
✅ On-chain hash verified (32 bytes, not readable)
✅ Join with correct invite code: SUCCESS
✅ Join with wrong invite code: REJECTED
✅ Hash collision resistance verified
========================================
       ALL TESTS PASSED! 🎉
========================================
```

### Frontend Changes

1. **Pool creation**: Invite code shown in success dialog (one-time only)
2. **Pool details**: Invite code no longer displayed (hash is not useful)
3. **Join by invite**: User enters plaintext code, frontend sends to contract

### Key Files Modified

- `programs/arisan_contracts/src/state/pool.rs` - `invite_code_hash: [u8; 32]`
- `programs/arisan_contracts/src/instructions/create_pool.rs` - SHA256 hash before store
- `programs/arisan_contracts/src/instructions/join_pool.rs` - Hash input and compare
- `src/lib/solana/program.ts` - Updated TypeScript types
- `src/lib/solana/accounts.ts` - Hash-based pool lookup
- `src/hooks/use-solana-program.ts` - Capture invite code from tx logs
