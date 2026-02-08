use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::state::{Pool, Member, PoolStatus};
use crate::errors::ArisanError;

/// Claim Stake Refund Instruction
///
/// After pool completion, members can reclaim their deposited stake.
/// This returns the collateral that was locked at the start.
///
/// Key concepts for Solidity devs:
/// - Only available when pool.status == Completed
/// - Each member can only claim once (stake_deposited becomes false)
/// - Transfers SOL from vault back to member
#[derive(Accounts)]
pub struct ClaimStakeRefund<'info> {
    /// Member claiming their stake
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool (must be Completed)
    #[account(
        constraint = pool.status == PoolStatus::Completed @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - will be updated to mark stake claimed
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ ArisanError::Unauthorized,
        constraint = member.stake_deposited @ ArisanError::StakeNotDeposited,
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - holds the stake
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Handler for claim_stake_refund instruction
pub fn handler(ctx: Context<ClaimStakeRefund>) -> Result<()> {
    let member = &mut ctx.accounts.member;

    let stake_amount = member.stake_amount;
    let pool = &ctx.accounts.pool;

    // Transfer SOL from vault back to user using invoke_signed
    // Vault is a SystemAccount (owned by System Program), so we need CPI
    let pool_key = pool.key();
    let vault_seeds: &[&[u8]] = &[
        Pool::VAULT_SEED_PREFIX,
        pool_key.as_ref(),
        &[pool.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.user.key(),
        stake_amount,
    );

    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Mark stake as claimed (prevent double-claim)
    member.stake_deposited = false;
    member.stake_amount = 0;

    // Emit event
    emit!(StakeRefunded {
        pool: ctx.accounts.pool.key(),
        member: ctx.accounts.user.key(),
        amount: stake_amount,
    });

    msg!("Stake refunded: {} lamports to {}",
        stake_amount,
        ctx.accounts.user.key()
    );

    Ok(())
}

/// Event emitted when stake is refunded
#[event]
pub struct StakeRefunded {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
}
