use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::state::{Pool, Member, Payment, PoolStatus, Currency};
use crate::errors::ArisanError;

/// Make Payment Instruction (SOL version)
///
/// Members call this monthly to contribute to the pool.
/// Payment goes to the vault and is tracked per-round.
///
/// Key concepts for Solidity devs:
/// - Each payment creates a new Payment PDA (like a receipt)
/// - The PDA seeds include round number, preventing double-payments
/// - If account already exists, Anchor will fail (duplicate payment)
#[derive(Accounts)]
pub struct MakePayment<'info> {
    /// Member making the payment
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool (must be Active status)
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
        constraint = pool.currency == Currency::Sol @ ArisanError::InvalidCurrency,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - must not be kicked
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == user.key() @ ArisanError::Unauthorized,
        constraint = !member.is_kicked @ ArisanError::MemberKicked,
    )]
    pub member: Account<'info, Member>,

    /// Payment record - created for this round
    /// If this already exists, the instruction will fail (double-payment protection)
    #[account(
        init,
        payer = user,
        space = Payment::SPACE,
        seeds = [
            Payment::SEED_PREFIX,
            pool.key().as_ref(),
            user.key().as_ref(),
            &[pool.current_round],
        ],
        bump,
    )]
    pub payment: Account<'info, Payment>,

    /// SOL Vault - receives the payment
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program for transfers and account creation
    pub system_program: Program<'info, System>,
}

/// Handler for make_payment instruction
pub fn handler(ctx: Context<MakePayment>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let member = &mut ctx.accounts.member;
    let payment = &mut ctx.accounts.payment;
    let clock = Clock::get()?;

    // Only require stake if pool has stake enabled
    if pool.stake_enabled {
        require!(member.stake_deposited, ArisanError::StakeNotDeposited);
    }

    // Clear grace period if paying during grace (member recovered)
    if member.in_grace_period {
        member.in_grace_period = false;
        member.grace_deadline = 0;
        member.in_default = false;
    }

    let payment_amount = pool.contribution_amount;

    // Transfer SOL from user to vault
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, payment_amount)?;

    // Initialize payment record
    payment.pool = pool.key();
    payment.member = ctx.accounts.user.key();
    payment.round = pool.current_round;
    payment.amount = payment_amount;
    payment.paid_at = clock.unix_timestamp;
    payment.bump = ctx.bumps.payment;

    // Update member payment count
    member.payments_made = member.payments_made.checked_add(1)
        .ok_or(ArisanError::Overflow)?;

    // Emit event
    emit!(PaymentMade {
        pool: pool.key(),
        member: ctx.accounts.user.key(),
        round: pool.current_round,
        amount: payment_amount,
        total_payments: member.payments_made,
    });

    msg!("Payment made: {} lamports from {} for round {}",
        payment_amount,
        ctx.accounts.user.key(),
        pool.current_round
    );

    Ok(())
}

/// Event emitted when a payment is made
#[event]
pub struct PaymentMade {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub round: u8,
    pub amount: u64,
    pub total_payments: u8,
}
