use anchor_lang::prelude::*;

/// Payment Account - Records each member's payment per round
///
/// PDA Seeds: ["payment", pool.key(), member_wallet.key(), round]
/// This creates a unique account for each payment, preventing double-payments.
///
/// Think of it like a nested mapping:
/// mapping(pool => mapping(member => mapping(round => Payment)))
#[account]
#[derive(Default)]
pub struct Payment {
    /// The pool this payment belongs to
    pub pool: Pubkey,

    /// Member wallet who made the payment
    pub member: Pubkey,

    /// Round number for this payment
    pub round: u8,

    /// Amount paid (should match contribution_amount)
    pub amount: u64,

    /// Unix timestamp when payment was made
    pub paid_at: i64,

    /// Bump seed for PDA
    pub bump: u8,
}

impl Payment {
    pub const SPACE: usize = 8  // Anchor discriminator
        + 32  // pool: Pubkey
        + 32  // member: Pubkey
        + 1   // round: u8
        + 8   // amount: u64
        + 8   // paid_at: i64
        + 1;  // bump: u8

    pub const SEED_PREFIX: &'static [u8] = b"payment";
}

/// Round Summary - Tracks aggregate payment status per round
/// This is derived on-read, not stored separately
/// (In Solidity, you might store this in the contract)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RoundStatus {
    pub round: u8,
    pub total_expected: u64,
    pub total_received: u64,
    pub payments_made: u8,
    pub all_paid: bool,
}
