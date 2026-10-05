use anchor_lang::prelude::*;

pub mod draw_randomness;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Aw54KXqUyccCACmmry5MmCmTzqJqKfmnL868aMpJaGbB");

/// Arisan - Trustless Rotating Savings Pool on Solana
///
/// This program implements a ROSCA (Rotating Savings and Credit Association)
/// where members contribute monthly, and one member wins the pot each round
/// using verifiable random selection.
///
/// Key Concepts for Solidity Devs:
/// - Programs are stateless (like libraries) - state lives in Accounts
/// - Each "instance" (pool) is a separate Account with its own address
/// - PDAs (Program Derived Addresses) = deterministic addresses without private keys
/// - CPIs (Cross-Program Invocations) = calling other programs (like external calls)
#[program]
pub mod arisan_contracts {
    use super::*;

    /// Create a new savings pool
    ///
    /// # Arguments
    /// * `name` - Pool name (max 32 chars)
    /// * `max_members` - Maximum number of members (2-20)
    /// * `contribution_amount` - Monthly contribution in lamports/token units
    /// * `currency` - 0=SOL, 1=USDC, 2=USDT
    /// * `stake_multiplier` - Collateral multiplier (1x, 2x, 3x)
    /// * `stake_enabled` - Whether stake is required for this pool
    /// * `auto_mode` - Pre-fund all payments on join, auto-start when full
    ///
    /// # Returns
    /// Creates Pool account with unique invite code
    pub fn create_pool(
        ctx: Context<CreatePool>,
        name: String,
        max_members: u8,
        contribution_amount: u64,
        currency: u8,
        stake_multiplier: u8,
        stake_enabled: bool,
        auto_mode: bool,
    ) -> Result<()> {
        instructions::create_pool::handler(ctx, name, max_members, contribution_amount, currency, stake_multiplier, stake_enabled, auto_mode)
    }

    /// Join a pool using invite code
    ///
    /// # Arguments
    /// * `invite_code` - 8-character invite code from pool creator
    ///
    /// # Requirements
    /// - Pool must be in Pending status
    /// - Pool must not be full
    /// - User must not already be a member
    pub fn join_pool(
        ctx: Context<JoinPool>,
        invite_code: String,
    ) -> Result<()> {
        instructions::join_pool::handler(ctx, invite_code)
    }

    /// Deposit stake (collateral) into pool vault
    ///
    /// Stake = contribution_amount * stake_multiplier
    /// This must be done before pool can start.
    ///
    /// # Requirements
    /// - User must be a pool member
    /// - Pool must be in Pending status
    /// - Stake not already deposited
    pub fn deposit_stake(ctx: Context<DepositStake>) -> Result<()> {
        instructions::deposit_stake::handler(ctx)
    }

    /// Start the pool (authority only)
    ///
    /// Transitions pool from Pending to Active status.
    /// Sets up first draw timestamp.
    ///
    /// # Requirements
    /// - Caller must be pool authority
    /// - Pool must have at least 2 members
    /// - Pool must be in Pending status
    pub fn start_pool(ctx: Context<StartPool>) -> Result<()> {
        instructions::start_pool::handler(ctx)
    }

    /// Leave pool before it starts
    ///
    /// Returns deposited stake if any.
    /// Closes member account and returns rent.
    ///
    /// # Requirements
    /// - Pool must be in Pending status
    /// - User must be a member
    pub fn leave_pool(ctx: Context<LeavePool>) -> Result<()> {
        instructions::leave_pool::handler(ctx)
    }

    /// Make monthly contribution payment
    ///
    /// Transfers contribution_amount from member to vault.
    /// Creates a Payment record to prevent double-payments.
    ///
    /// # Requirements
    /// - Pool must be Active
    /// - User must be a member with stake deposited
    /// - Payment not already made for current round
    pub fn make_payment(ctx: Context<MakePayment>) -> Result<()> {
        instructions::make_payment::handler(ctx)
    }

    /// Commit the slot that will select this round's winner.
    ///
    /// The slot hash does not exist yet when this lands, so the caller cannot
    /// aim the commit at a chosen member. `execute_draw` reads that hash later.
    pub fn commit_draw_randomness(ctx: Context<CommitDrawRandomness>) -> Result<()> {
        instructions::execute_draw::commit_handler(ctx)
    }

    /// Execute draw to select round winner and AUTO-PAY them
    ///
    /// The winner is derived from the committed slot hash and the eligible
    /// roster. The caller supplies accounts, not a choice of winner.
    ///
    /// # Requirements
    /// - Pool must be Active
    /// - Randomness committed for this round, and the slot hash available
    /// - Caller must be pool authority OR anyone after deadline
    /// - Payout wallet must be the derived eligible member
    pub fn execute_draw(ctx: Context<ExecuteDraw>) -> Result<()> {
        instructions::execute_draw::handler(ctx)
    }

    /// Claim winnings for a round (BACKUP/FALLBACK)
    ///
    /// Winner withdraws their winnings from the vault.
    /// Advances pool to next round after claim.
    /// Note: Normally not needed since execute_draw auto-pays.
    ///
    /// # Requirements
    /// - Pool must be Active
    /// - Caller must be the winner for that round
    /// - Winnings not already claimed
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::claim_winnings::handler(ctx)
    }

    /// Claim stake refund after pool completion
    ///
    /// Members reclaim their deposited stake after all rounds complete.
    ///
    /// # Requirements
    /// - Pool must be Completed
    /// - User must be a member with stake deposited
    pub fn claim_stake_refund(ctx: Context<ClaimStakeRefund>) -> Result<()> {
        instructions::claim_stake_refund::handler(ctx)
    }

    /// Refund stake for any member (permissionless)
    ///
    /// After pool completion, ANYONE can trigger stake refund for any member.
    /// This enables Clockwork automation or batch processing.
    /// Funds go directly to member's wallet, not the caller.
    ///
    /// # Requirements
    /// - Pool must be Completed
    /// - Member must have stake deposited
    pub fn refund_all_stakes(ctx: Context<RefundAllStakes>) -> Result<()> {
        instructions::refund_all_stakes::handler(ctx)
    }

    /// Mark a member as defaulter if they missed payment
    ///
    /// Checks if member has paid for current round. If not:
    /// - If stake_enabled: slashes their stake
    /// - Sets 48h grace period to recover
    /// If already in grace period and past deadline: kicks member
    ///
    /// Payment status is read from the member's Payment PDA for this round.
    /// A paid member cannot be slashed, graced, or kicked from this path.
    /// An unpaid member can be marked only after the round deadline.
    ///
    /// # Requirements
    /// - Pool must be Active
    /// - Anyone can call (permissionless for automation)
    pub fn mark_defaulter(ctx: Context<MarkDefaulter>) -> Result<()> {
        instructions::mark_defaulters::handler(ctx)
    }

    /// Rejoin pool after being kicked
    ///
    /// Kicked members can rejoin by paying what they owe:
    /// - If stake_enabled: stake amount + missed contributions
    /// - If !stake_enabled: missed contributions only
    ///
    /// # Requirements
    /// - Pool must be Active
    /// - Member must be kicked
    pub fn rejoin_pool(ctx: Context<RejoinPool>) -> Result<()> {
        instructions::rejoin_pool::handler(ctx)
    }
}
