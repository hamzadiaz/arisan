use anchor_lang::prelude::*;

/// Currency types supported by pools
/// In Solidity, you'd use an enum. Anchor enums serialize to a single byte.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum Currency {
    #[default]
    Sol,
    Usdc,
    Usdt,
}

/// Pool status enum - tracks lifecycle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum PoolStatus {
    #[default]
    Pending,   // Waiting for members
    Active,    // Running, accepting payments
    Completed, // All rounds done
    Cancelled, // Pool was cancelled
}

/// Pool Account - Main data structure
///
/// In Solidity, this would be stored in contract state variables.
/// In Solana, it's a separate account owned by the program.
///
/// PDA Seeds: ["pool", authority.key(), pool_count]
/// This gives each creator unique pool addresses.
#[account]
#[derive(Default)]
pub struct Pool {
    /// Pool creator/admin (like msg.sender who deployed)
    pub authority: Pubkey,

    /// Pool name (32 bytes max, padded)
    pub name: [u8; 32],

    /// Maximum members allowed (5-20 typical)
    pub max_members: u8,

    /// Current member count
    pub member_count: u8,

    /// Monthly contribution amount (in lamports for SOL, or token units for SPL)
    /// For SOL: 1 SOL = 1_000_000_000 lamports
    /// For USDC: 1 USDC = 1_000_000 units (6 decimals)
    pub contribution_amount: u64,

    /// Currency type (SOL, USDC, USDT)
    pub currency: Currency,

    /// Total rounds (typically equals max_members)
    pub total_rounds: u8,

    /// Current round (0 = not started, 1 = first round)
    pub current_round: u8,

    /// Pool status
    pub status: PoolStatus,

    /// Unix timestamp of next draw
    pub next_draw_timestamp: i64,

    /// SHA256 hash of the 8-character invite code (for secure verification)
    pub invite_code_hash: [u8; 32],

    /// Stake multiplier (1x, 2x, 3x) - for collateral
    pub stake_multiplier: u8,

    /// Bump seed for PDA derivation (saves compute on re-derivation)
    pub bump: u8,

    /// Bump seed for the SOL vault PDA
    pub vault_bump: u8,

    /// Token vault address (for USDC/USDT) - Pubkey::default() for SOL
    pub token_vault: Pubkey,

    /// Pool creation timestamp
    pub created_at: i64,

    /// Creator's pool count at creation (for unique PDA)
    pub pool_index: u64,

    /// Whether stake is required for this pool
    pub stake_enabled: bool,

    /// Grace period duration in seconds (default: 172800 = 48 hours)
    pub grace_period_seconds: i64,

    /// Auto mode: pre-fund all payments on join, auto-start when full
    pub auto_mode: bool,
}

impl Pool {
    /// Calculate space needed for Pool account
    /// In Solana, you pay rent based on account size
    /// Space = 8 (discriminator) + all fields
    pub const SPACE: usize = 8  // Anchor discriminator
        + 32  // authority: Pubkey
        + 32  // name: [u8; 32]
        + 1   // max_members: u8
        + 1   // member_count: u8
        + 8   // contribution_amount: u64
        + 1   // currency: enum (1 byte)
        + 1   // total_rounds: u8
        + 1   // current_round: u8
        + 1   // status: enum (1 byte)
        + 8   // next_draw_timestamp: i64
        + 32  // invite_code_hash: [u8; 32] (SHA256 hash)
        + 1   // stake_multiplier: u8
        + 1   // bump: u8
        + 1   // vault_bump: u8
        + 32  // token_vault: Pubkey
        + 8   // created_at: i64
        + 8   // pool_index: u64
        + 1   // stake_enabled: bool
        + 8   // grace_period_seconds: i64
        + 1;  // auto_mode: bool

    /// Seeds for Pool PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"pool";

    /// Seeds for SOL vault PDA
    pub const VAULT_SEED_PREFIX: &'static [u8] = b"vault";
}
