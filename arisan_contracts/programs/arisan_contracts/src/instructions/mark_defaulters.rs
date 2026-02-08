use anchor_lang::prelude::*;

use crate::state::{Pool, Member, PoolStatus};
use crate::errors::ArisanError;

/// Mark Defaulters Instruction
///
/// Checks a single member and marks them as a defaulter if they missed payment.
/// This instruction is called for each member individually.
///
/// Logic:
/// 1. If member hasn't paid for current round AND not already in grace AND not kicked:
///    - If stake_enabled: slash their stake to the vault
///    - Set in_grace_period = true, grace_deadline = now + 48h
/// 2. If member is in grace period AND past deadline:
///    - Set is_kicked = true
///    - Decrement pool.member_count
///    - Increment missed_rounds
///
/// This can be called by anyone (permissionless), allowing automation via Clockwork.
#[derive(Accounts)]
pub struct MarkDefaulter<'info> {
    /// Caller - anyone can call this (permissionless for automation)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The pool (must be Active)
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// Member account to check for default
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), member.wallet.as_ref()],
        bump = member.bump,
        constraint = member.pool == pool.key() @ ArisanError::NotMember,
    )]
    pub member: Account<'info, Member>,

    /// SOL Vault - receives slashed stake (if applicable)
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Handler for mark_defaulter instruction
pub fn handler(ctx: Context<MarkDefaulter>, has_paid: bool) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let member = &mut ctx.accounts.member;
    let clock = Clock::get()?;

    // Skip if member is already kicked
    if member.is_kicked {
        msg!("Member {} is already kicked, skipping", member.wallet);
        return Ok(());
    }

    // Check if member is in grace period and past deadline - kick them
    if member.in_grace_period && clock.unix_timestamp > member.grace_deadline {
        member.is_kicked = true;
        member.missed_rounds = member.missed_rounds.checked_add(1).unwrap_or(255);
        pool.member_count = pool.member_count.saturating_sub(1);

        emit!(MemberKicked {
            pool: pool.key(),
            member: member.wallet,
            reason: "Grace period expired".to_string(),
            missed_rounds: member.missed_rounds,
        });

        msg!("Member {} kicked - grace period expired", member.wallet);
        return Ok(());
    }

    // If member hasn't paid and is not in grace period, mark as defaulter
    if !has_paid && !member.in_grace_period {
        // If stake enabled, slash the stake
        if pool.stake_enabled && member.stake_deposited {
            member.stake_deposited = false;
            member.stake_amount = 0;
            member.in_default = true;

            emit!(StakeSlashed {
                pool: pool.key(),
                member: member.wallet,
                round: pool.current_round,
            });

            msg!("Member {} stake slashed for round {}", member.wallet, pool.current_round);
        }

        // Set grace period (48 hours to recover)
        member.in_grace_period = true;
        member.grace_deadline = clock.unix_timestamp
            .checked_add(pool.grace_period_seconds)
            .ok_or(ArisanError::Overflow)?;

        emit!(GracePeriodStarted {
            pool: pool.key(),
            member: member.wallet,
            deadline: member.grace_deadline,
            stake_slashed: pool.stake_enabled && member.in_default,
        });

        msg!("Member {} entered grace period until {}", member.wallet, member.grace_deadline);
    }

    Ok(())
}

/// Event emitted when a member's stake is slashed
#[event]
pub struct StakeSlashed {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub round: u8,
}

/// Event emitted when a member enters grace period
#[event]
pub struct GracePeriodStarted {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub deadline: i64,
    pub stake_slashed: bool,
}

/// Event emitted when a member is kicked
#[event]
pub struct MemberKicked {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub reason: String,
    pub missed_rounds: u8,
}
