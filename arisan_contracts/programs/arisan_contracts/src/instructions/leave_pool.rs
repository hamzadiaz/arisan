use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::state::{Pool, Member, PoolStatus};
use crate::errors::ArisanError;

/// Leave Pool Instruction
///
/// Allows a member to leave a pool BEFORE it starts.
/// If stake was deposited, it's returned to the member.
///
/// Key concepts for Solidity devs:
/// - Can only leave when pool.status == Pending
/// - Stake refund is automatic via vault transfer
/// - Member account is closed and rent returned to user
#[derive(Accounts)]
pub struct LeavePool<'info> {
    /// Member leaving the pool
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool (must be in Pending status)
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Pending @ ArisanError::CannotLeaveActivePool,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - will be closed, rent returned to user
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ ArisanError::Unauthorized,
        close = user, // Return rent to user when closing
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - for stake refund
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program for transfers
    pub system_program: Program<'info, System>,
}

/// Handler for leave_pool instruction
pub fn handler(ctx: Context<LeavePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let member = &ctx.accounts.member;

    // If stake was deposited, refund it
    if member.stake_deposited && member.stake_amount > 0 {
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
            member.stake_amount,
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

        msg!("Stake refunded: {} lamports to {}", member.stake_amount, ctx.accounts.user.key());
    }

    let wallet = ctx.accounts.user.key();
    let len = pool.roster_len as usize;
    let idx = pool.member_wallets[..len]
        .iter()
        .position(|entry| *entry == wallet)
        .ok_or(ArisanError::NotMember)?;
    let last = len
        .checked_sub(1)
        .ok_or(ArisanError::Overflow)?;
    pool.member_wallets[idx] = pool.member_wallets[last];
    pool.member_wallets[last] = Pubkey::default();
    pool.roster_len = pool.roster_len.checked_sub(1)
        .ok_or(ArisanError::Overflow)?;

    // Decrement member count
    pool.member_count = pool.member_count.checked_sub(1)
        .ok_or(ArisanError::Overflow)?;

    // Emit event
    emit!(MemberLeft {
        pool: pool.key(),
        member: ctx.accounts.user.key(),
        stake_refunded: member.stake_amount,
        remaining_members: pool.member_count,
    });

    msg!("Member {} left pool {}. Remaining members: {}",
        ctx.accounts.user.key(),
        pool.key(),
        pool.member_count
    );

    // Member account is automatically closed due to close = user constraint

    Ok(())
}

/// Event emitted when a member leaves a pool
#[event]
pub struct MemberLeft {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub stake_refunded: u64,
    pub remaining_members: u8,
}
