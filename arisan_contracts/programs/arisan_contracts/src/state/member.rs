use anchor_lang::prelude::*;

/// Member Account - Tracks each member's state in a pool
///
/// PDA Seeds: ["member", pool.key(), wallet.key()]
/// This creates a unique account for each wallet in each pool.
///
/// Think of it like a mapping: mapping(address => mapping(poolId => MemberInfo))
/// But in Solana, each mapping entry is a separate account.
#[account]
#[derive(Default)]
pub struct Member {
    /// The pool this membership belongs to
    pub pool: Pubkey,

    /// Member's wallet address
    pub wallet: Pubkey,

    /// Whether this member has received winnings
    pub has_won: bool,

    /// Round number when won (0 if not yet)
    pub won_round: u8,

    /// Whether stake has been deposited
    pub stake_deposited: bool,

    /// Amount of stake deposited (for refund calculation)
    pub stake_amount: u64,

    /// Number of payments made
    pub payments_made: u8,

    /// Join timestamp
    pub joined_at: i64,

    /// Position in the pool (1-indexed, for display)
    pub position: u8,

    /// Bump seed for PDA
    pub bump: u8,

    /// Whether member is in default (missed payment, stake slashed)
    pub in_default: bool,

    /// Whether member is in grace period
    pub in_grace_period: bool,

    /// Unix timestamp when grace period ends (0 if not in grace)
    pub grace_deadline: i64,

    /// Whether member has been kicked from pool
    pub is_kicked: bool,

    /// Number of rounds missed (for rejoin calculation)
    pub missed_rounds: u8,
}

impl Member {
    pub const SPACE: usize = 8  // Anchor discriminator
        + 32  // pool: Pubkey
        + 32  // wallet: Pubkey
        + 1   // has_won: bool
        + 1   // won_round: u8
        + 1   // stake_deposited: bool
        + 8   // stake_amount: u64
        + 1   // payments_made: u8
        + 8   // joined_at: i64
        + 1   // position: u8
        + 1   // bump: u8
        + 1   // in_default: bool
        + 1   // in_grace_period: bool
        + 8   // grace_deadline: i64
        + 1   // is_kicked: bool
        + 1;  // missed_rounds: u8

    pub const SEED_PREFIX: &'static [u8] = b"member";
}

/// Creator Stats - Tracks how many pools a user has created
/// Used to generate unique pool indices for PDA derivation
///
/// PDA Seeds: ["creator", wallet.key()]
#[account]
#[derive(Default)]
pub struct CreatorStats {
    /// Number of pools created by this wallet
    pub pool_count: u64,

    /// Bump seed for PDA
    pub bump: u8,
}

impl CreatorStats {
    pub const SPACE: usize = 8  // Anchor discriminator
        + 8   // pool_count: u64
        + 1;  // bump: u8

    pub const SEED_PREFIX: &'static [u8] = b"creator";
}
