use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::hash::hash;

use crate::state::{Pool, Member, PoolStatus};
use crate::errors::ArisanError;

/// Join Pool Instruction
///
/// Allows a user to join a pool using an invite code.
/// Creates a Member PDA for tracking their participation.
///
/// In AUTO MODE:
/// - Collects stake on join (if stake enabled) - NOT all payments!
/// - Auto-starts pool when full (no manual start needed)
/// - Draws auto-trigger on schedule (anyone can call execute_draw after time)
/// - Payments still made monthly - if missed, 48h grace then kicked
///
/// Key concepts for Solidity devs:
/// - Unlike Solidity where you'd call pool.join(), here we pass all accounts explicitly
/// - The Member account is a PDA, so only our program can create/modify it
/// - invite_code validation is done against the pool's stored code
#[derive(Accounts)]
#[instruction(invite_code: String)]
pub struct JoinPool<'info> {
    /// User joining the pool - pays for account creation
    #[account(mut)]
    pub user: Signer<'info>,

    /// The pool to join (must be in Pending status)
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Pending @ ArisanError::PoolNotPending,
        constraint = pool.member_count < pool.max_members @ ArisanError::PoolFull,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account - PDA created for this user in this pool
    /// Seeds ensure uniqueness: one member account per wallet per pool
    #[account(
        init,
        payer = user,
        space = Member::SPACE,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - PDA that holds SOL contributions (needed for auto mode)
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program for account creation and transfers
    pub system_program: Program<'info, System>,
}

/// Handler for join_pool instruction
pub fn handler(
    ctx: Context<JoinPool>,
    invite_code: String,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let member = &mut ctx.accounts.member;
    let clock = Clock::get()?;

    // Verify invite code by hashing input and comparing to stored hash
    // This prevents anyone from reading the invite code from on-chain data
    let invite_hash = hash(invite_code.as_bytes());
    require!(
        invite_hash.to_bytes() == pool.invite_code_hash,
        ArisanError::InvalidInviteCode
    );

    // Calculate position (1-indexed)
    let position = pool.member_count + 1;

    // Initialize member account
    member.pool = pool.key();
    member.wallet = ctx.accounts.user.key();
    member.has_won = false;
    member.won_round = 0;
    member.joined_at = clock.unix_timestamp;
    member.position = position;
    member.bump = ctx.bumps.member;

    // AUTO MODE: Collect stake on join (if enabled), auto-start when full
    // Note: We only collect STAKE here, not all payments - that defeats the ROSCA purpose!
    // Payments are still made monthly, but draws auto-trigger on schedule.
    if pool.auto_mode && pool.stake_enabled {
        // Calculate stake amount
        let stake_amount = pool.contribution_amount
            .checked_mul(pool.stake_multiplier as u64)
            .ok_or(ArisanError::Overflow)?;

        // Transfer stake to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake_amount,
        )?;

        // Mark stake as deposited
        member.stake_deposited = true;
        member.stake_amount = stake_amount;
        member.payments_made = 0; // Payments still made monthly!

        msg!("Auto mode: Stake deposited {} lamports", stake_amount);
    } else {
        // Normal mode OR auto mode without stake: No deposits on join
        member.stake_deposited = false;
        member.stake_amount = 0;
        member.payments_made = 0;
    }

    // Increment pool member count
    pool.member_count = pool.member_count.checked_add(1)
        .ok_or(ArisanError::Overflow)?;

    // AUTO MODE: Auto-start when pool is full
    let auto_started = if pool.auto_mode && pool.member_count == pool.max_members {
        // Start the pool automatically
        pool.status = PoolStatus::Active;
        pool.current_round = 1;

        // Set next draw timestamp (5 minutes for devnet testing)
        const DRAW_INTERVAL: i64 = 300; // 5 minutes for devnet
        pool.next_draw_timestamp = clock.unix_timestamp.checked_add(DRAW_INTERVAL)
            .ok_or(ArisanError::Overflow)?;

        msg!("Auto mode: Pool started! First draw at {}", pool.next_draw_timestamp);
        true
    } else {
        false
    };

    // Emit event
    emit!(MemberJoined {
        pool: pool.key(),
        member: ctx.accounts.user.key(),
        position: member.position,
        member_count: pool.member_count,
        auto_started,
    });

    msg!("Member {} joined pool {} at position {}",
        ctx.accounts.user.key(),
        pool.key(),
        member.position
    );

    Ok(())
}

/// Event emitted when a member joins a pool
#[event]
pub struct MemberJoined {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub position: u8,
    pub member_count: u8,
    pub auto_started: bool,
}
