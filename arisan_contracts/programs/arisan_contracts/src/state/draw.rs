use anchor_lang::prelude::*;

/// Draw Account - Records each round's winner
///
/// PDA Seeds: ["draw", pool.key(), round]
/// One Draw account per round per pool.
///
/// Key concepts for Solidity devs:
/// - This is like a struct in a mapping(poolId => mapping(round => Draw))
/// - VRF result is stored for transparency and verification
#[account]
#[derive(Default)]
pub struct Draw {
    /// The pool this draw belongs to
    pub pool: Pubkey,

    /// Round number
    pub round: u8,

    /// Winner's wallet address
    pub winner: Pubkey,

    /// Amount won (contribution * member_count)
    pub amount: u64,

    /// VRF seed/result used for selection (for verification)
    /// On devnet: pseudo-random from slot hash
    /// On mainnet: Switchboard VRF result
    pub vrf_result: [u8; 32],

    /// Unix timestamp when draw was executed
    pub drawn_at: i64,

    /// Whether winner has claimed the winnings
    pub claimed: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl Draw {
    pub const SPACE: usize = 8  // Anchor discriminator
        + 32  // pool: Pubkey
        + 1   // round: u8
        + 32  // winner: Pubkey
        + 8   // amount: u64
        + 32  // vrf_result: [u8; 32]
        + 8   // drawn_at: i64
        + 1   // claimed: bool
        + 1;  // bump: u8

    pub const SEED_PREFIX: &'static [u8] = b"draw";
}
