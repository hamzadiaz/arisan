use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::state::{Pool, Member, PoolStatus, Currency};
use crate::errors::ArisanError;

/// Rejoin Pool Instruction
///
/// Allows kicked members to rejoin the pool by paying what they owe:
/// - If stake_enabled: stake amount + missed round contributions
/// - If !stake_enabled: missed round contributions only
///
/// This gives members a second chance while ensuring the pool isn't harmed.
#[derive(Accounts)]
pub struct RejoinPool<'info> {
    /// Member rejoining the pool
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool (must be Active)
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
        constraint = pool.currency == Currency::Sol @ ArisanError::InvalidCurrency,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - must be kicked to rejoin
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ ArisanError::Unauthorized,
        constraint = member.is_kicked @ ArisanError::NotKicked,
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - receives the rejoin payment
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Handler for rejoin_pool instruction
pub fn handler(ctx: Context<RejoinPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let member = &mut ctx.accounts.member;

    // Calculate total owed
    let stake_cost = if pool.stake_enabled {
        pool.contribution_amount
            .checked_mul(pool.stake_multiplier as u64)
            .ok_or(ArisanError::Overflow)?
    } else {
        0
    };

    let missed_cost = (member.missed_rounds as u64)
        .checked_mul(pool.contribution_amount)
        .ok_or(ArisanError::Overflow)?;

    let total_owed = stake_cost
        .checked_add(missed_cost)
        .ok_or(ArisanError::Overflow)?;

    // Transfer total owed to vault
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, total_owed)?;

    // Reset member state
    member.is_kicked = false;
    member.in_default = false;
    member.in_grace_period = false;
    member.grace_deadline = 0;
    let old_missed_rounds = member.missed_rounds;
    member.missed_rounds = 0;

    // Update stake state if stake enabled
    if pool.stake_enabled {
        member.stake_deposited = true;
        member.stake_amount = stake_cost;
    }

    // Increment pool member count
    pool.member_count = pool.member_count.checked_add(1)
        .ok_or(ArisanError::Overflow)?;

    // Emit event
    emit!(MemberRejoined {
        pool: pool.key(),
        member: ctx.accounts.user.key(),
        stake_paid: stake_cost,
        missed_rounds_paid: old_missed_rounds,
        total_paid: total_owed,
    });

    msg!("Member {} rejoined pool. Paid {} lamports ({} stake + {} missed rounds)",
        ctx.accounts.user.key(),
        total_owed,
        stake_cost,
        missed_cost
    );

    Ok(())
}

/// Event emitted when a member rejoins
#[event]
pub struct MemberRejoined {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub stake_paid: u64,
    pub missed_rounds_paid: u8,
    pub total_paid: u64,
}
