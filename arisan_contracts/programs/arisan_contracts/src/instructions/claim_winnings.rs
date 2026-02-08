use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::state::{Pool, Member, Draw, PoolStatus};
use crate::errors::ArisanError;

/// Claim Winnings Instruction
///
/// Allows the winner to withdraw their winnings from the vault.
///
/// Key concepts for Solidity devs:
/// - The vault is a PDA, so we can transfer from it using program authority
/// - Only the winner (verified by Draw account) can claim
/// - Advances to next round after claim (or when all have paid)
#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    /// Winner claiming their prize
    #[account(mut)]
    pub winner: Signer<'info>,

    /// The pool
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// Winner's member account
    #[account(
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), winner.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == winner.key() @ ArisanError::Unauthorized,
        constraint = member.has_won @ ArisanError::AlreadyWon, // Must have won
    )]
    pub member: Account<'info, Member>,

    /// Draw record - verifies winner and tracks claim
    #[account(
        mut,
        seeds = [Draw::SEED_PREFIX, pool.key().as_ref(), &[member.won_round]],
        bump = draw.bump,
        constraint = draw.winner == winner.key() @ ArisanError::Unauthorized,
        constraint = !draw.claimed @ ArisanError::AlreadyWon,
    )]
    pub draw: Account<'info, Draw>,

    /// SOL Vault - holds the winnings
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

/// Handler for claim_winnings instruction
pub fn handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let draw = &mut ctx.accounts.draw;
    let clock = Clock::get()?;

    let winnings = draw.amount;

    // Transfer SOL from vault to winner using invoke_signed
    // Vault is a SystemAccount (owned by System Program), so we need CPI
    // This is a BACKUP/FALLBACK in case auto-pay in execute_draw fails
    let pool_key = pool.key();
    let vault_seeds: &[&[u8]] = &[
        Pool::VAULT_SEED_PREFIX,
        pool_key.as_ref(),
        &[pool.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.winner.key(),
        winnings,
    );

    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.winner.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Mark as claimed
    draw.claimed = true;

    // Advance to next round if not final round
    if pool.current_round < pool.total_rounds {
        pool.current_round = pool.current_round.checked_add(1)
            .ok_or(ArisanError::Overflow)?;

        // Set next draw timestamp
        // DEVNET: 5 minutes for testing | MAINNET: Change to 2_592_000 (30 days)
        const DRAW_INTERVAL: i64 = 300; // 5 minutes
        pool.next_draw_timestamp = clock.unix_timestamp.checked_add(DRAW_INTERVAL)
            .ok_or(ArisanError::Overflow)?;
    } else {
        // Final round - pool is complete
        pool.status = PoolStatus::Completed;
    }

    // Emit event
    emit!(WinningsClaimed {
        pool: pool.key(),
        round: draw.round,
        winner: ctx.accounts.winner.key(),
        amount: winnings,
        next_round: pool.current_round,
    });

    msg!("Winnings claimed: {} lamports to {}. Next round: {}",
        winnings,
        ctx.accounts.winner.key(),
        pool.current_round
    );

    Ok(())
}

/// Event emitted when winnings are claimed
#[event]
pub struct WinningsClaimed {
    pub pool: Pubkey,
    pub round: u8,
    pub winner: Pubkey,
    pub amount: u64,
    pub next_round: u8,
}
