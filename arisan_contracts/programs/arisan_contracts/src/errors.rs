use anchor_lang::prelude::*;

/// Custom error codes for the Arisan program
/// In Solidity, you'd use require() with strings or custom errors.
/// Anchor uses error codes that get serialized efficiently.
#[error_code]
pub enum ArisanError {
    #[msg("Pool name is too long (max 32 characters)")]
    NameTooLong,

    #[msg("Invalid member count (must be between 2 and 20)")]
    InvalidMemberCount,

    #[msg("Invalid contribution amount (must be greater than 0)")]
    InvalidContributionAmount,

    #[msg("Invalid stake multiplier (must be 1, 2, or 3)")]
    InvalidStakeMultiplier,

    #[msg("Pool is full")]
    PoolFull,

    #[msg("Pool is not in pending status")]
    PoolNotPending,

    #[msg("Pool is not active")]
    PoolNotActive,

    #[msg("Already a member of this pool")]
    AlreadyMember,

    #[msg("Not a member of this pool")]
    NotMember,

    #[msg("Invalid invite code")]
    InvalidInviteCode,

    #[msg("Stake not deposited")]
    StakeNotDeposited,

    #[msg("Stake already deposited")]
    StakeAlreadyDeposited,

    #[msg("Already won in this pool")]
    AlreadyWon,

    #[msg("Payment already made for this round")]
    PaymentAlreadyMade,

    #[msg("Not enough members to start pool")]
    NotEnoughMembers,

    #[msg("Unauthorized - not pool authority")]
    Unauthorized,

    #[msg("Draw not ready yet")]
    DrawNotReady,

    #[msg("Invalid currency type")]
    InvalidCurrency,

    #[msg("Numerical overflow")]
    Overflow,

    #[msg("Pool already started")]
    PoolAlreadyStarted,

    #[msg("Cannot leave active pool")]
    CannotLeaveActivePool,

    #[msg("Insufficient funds in vault")]
    InsufficientFunds,

    #[msg("Member is in default")]
    MemberInDefault,

    #[msg("Member is kicked from pool")]
    MemberKicked,

    #[msg("Member is not kicked")]
    NotKicked,

    #[msg("Member is in grace period")]
    MemberInGracePeriod,

    #[msg("Stake not enabled for this pool")]
    StakeNotEnabled,

    #[msg("Winner is not the member derived from on-chain randomness")]
    WinnerMismatch,

    #[msg("Member set does not match the pool roster")]
    InvalidMemberSet,

    #[msg("No eligible members for this draw")]
    NoEligibleMembers,

    #[msg("Draw randomness has not been committed for this round")]
    RandomnessNotCommitted,

    #[msg("Draw randomness is not ready yet")]
    RandomnessNotReady,

    #[msg("Committed slot hash expired before the draw was revealed")]
    RandomnessExpired,

    #[msg("Draw randomness is already committed for this round")]
    RandomnessAlreadyCommitted,

    #[msg("Member has already paid this round")]
    MemberAlreadyPaid,

    #[msg("Round payment window is still open")]
    RoundNotDue,

    #[msg("Payment account does not match this member and round")]
    InvalidPaymentAccount,

    #[msg("All members must pay the current round")]
    RoundNotFullyPaid,
}
