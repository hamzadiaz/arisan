use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::state::{Pool, Member, PoolStatus, Currency};
use crate::errors::ArisanError;

/// Deposit Stake Instruction (SOL version)
///
/// Members must deposit stake (collateral) before the pool can start.
/// Stake = contribution_amount * stake_multiplier
///
/// This acts as insurance against members defaulting on payments.
/// After pool completion, honest members get their stake back.
///
/// Key concepts for Solidity devs:
/// - SOL transfers use the System Program's transfer instruction
/// - We transfer FROM user wallet TO vault PDA
/// - The vault PDA can hold SOL without a private key (program-controlled)
#[derive(Accounts)]
pub struct DepositStake<'info> {
    /// Member depositing stake
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool (must have stake enabled)
    /// Allow deposit during Pending OR during Active if member is in grace period (re-staking)
    #[account(
        constraint = pool.stake_enabled @ ArisanError::StakeNotEnabled,
        constraint = pool.currency == Currency::Sol @ ArisanError::InvalidCurrency,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - must exist and belong to user
    /// Either stake not deposited yet (initial) OR in grace period (re-staking after default)
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ ArisanError::Unauthorized,
        constraint = !member.is_kicked @ ArisanError::MemberKicked,
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - PDA that holds staked SOL
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program for SOL transfer
    pub system_program: Program<'info, System>,
}

/// Handler for deposit_stake instruction
pub fn handler(ctx: Context<DepositStake>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let member = &mut ctx.accounts.member;

    // Check conditions: either initial stake (Pending, not deposited) OR re-stake (Active, in grace)
    let is_initial_stake = pool.status == PoolStatus::Pending && !member.stake_deposited;
    let is_restake = pool.status == PoolStatus::Active && member.in_grace_period;

    require!(
        is_initial_stake || is_restake,
        ArisanError::StakeAlreadyDeposited
    );

    // Calculate stake amount: contribution * multiplier
    let stake_amount = pool.contribution_amount
        .checked_mul(pool.stake_multiplier as u64)
        .ok_or(ArisanError::Overflow)?;

    // Transfer SOL from user to vault
    // This is like address(vault).transfer(amount) in Solidity
    // but explicit about the transfer mechanism
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, stake_amount)?;

    // Update member state
    member.stake_deposited = true;
    member.stake_amount = stake_amount;

    // Clear grace period if re-staking (member recovered)
    if member.in_grace_period {
        member.in_grace_period = false;
        member.grace_deadline = 0;
        member.in_default = false;
    }

    // Emit event
    emit!(StakeDeposited {
        pool: pool.key(),
        member: ctx.accounts.user.key(),
        amount: stake_amount,
    });

    msg!("Stake deposited: {} lamports from {} to vault",
        stake_amount,
        ctx.accounts.user.key()
    );

    Ok(())
}

/// Event emitted when stake is deposited
#[event]
pub struct StakeDeposited {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
}
