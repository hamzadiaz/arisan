use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::state::{Pool, Member, PoolStatus};
use crate::errors::ArisanError;

/// Refund Stake for Member Instruction
///
/// After pool completion, ANYONE can trigger stake refund for ANY member.
/// This enables Clockwork automation or batch processing by a service.
///
/// Key concepts for Solidity devs:
/// - Permissionless: anyone can call this to refund any member
/// - Only works when pool.status == Completed
/// - Member must have stake deposited
/// - Funds go directly to member's wallet, not the caller
#[derive(Accounts)]
pub struct RefundAllStakes<'info> {
    /// Anyone can trigger refunds (for Clockwork automation)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The pool (must be Completed)
    #[account(
        constraint = pool.status == PoolStatus::Completed @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account to refund
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), member_wallet.key().as_ref()],
        bump = member.bump,
        constraint = member.pool == pool.key() @ ArisanError::NotMember,
        constraint = member.stake_deposited @ ArisanError::StakeNotDeposited,
    )]
    pub member: Account<'info, Member>,

    /// Member's wallet - receives the refund
    /// CHECK: Validated by PDA derivation with member
    #[account(
        mut,
        constraint = member.wallet == member_wallet.key() @ ArisanError::Unauthorized,
    )]
    pub member_wallet: UncheckedAccount<'info>,

    /// SOL Vault - holds the stakes
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

/// Handler for refund_all_stakes instruction
/// Refunds stake for a single member (can be called multiple times for different members)
pub fn handler(ctx: Context<RefundAllStakes>) -> Result<()> {
    let member = &mut ctx.accounts.member;
    let pool = &ctx.accounts.pool;

    let stake_amount = member.stake_amount;

    // Transfer SOL from vault to member's wallet using invoke_signed
    let pool_key = pool.key();
    let vault_seeds: &[&[u8]] = &[
        Pool::VAULT_SEED_PREFIX,
        pool_key.as_ref(),
        &[pool.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.member_wallet.key(),
        stake_amount,
    );

    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.member_wallet.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Mark stake as refunded (prevent double-refund)
    member.stake_deposited = false;
    member.stake_amount = 0;

    // Emit event
    emit!(StakeAutoRefunded {
        pool: pool.key(),
        member: ctx.accounts.member_wallet.key(),
        amount: stake_amount,
        triggered_by: ctx.accounts.payer.key(),
    });

    msg!("Stake auto-refunded: {} lamports to {} (triggered by {})",
        stake_amount,
        ctx.accounts.member_wallet.key(),
        ctx.accounts.payer.key()
    );

    Ok(())
}

/// Event emitted when stake is auto-refunded
#[event]
pub struct StakeAutoRefunded {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
    pub triggered_by: Pubkey,
}
