use anchor_lang::prelude::*;

use crate::state::{Pool, PoolStatus};
use crate::errors::ArisanError;

/// Start Pool Instruction
///
/// Allows the pool authority to activate the pool once:
/// 1. Enough members have joined (at least 2)
/// 2. All members have deposited stake (checked off-chain for now)
///
/// Once started, the pool enters Active status and draws can begin.
///
/// Key concepts for Solidity devs:
/// - Only the authority (pool creator) can start the pool
/// - This is like an onlyOwner modifier check
#[derive(Accounts)]
pub struct StartPool<'info> {
    /// Pool authority (creator) - must sign
    pub authority: Signer<'info>,

    /// The pool to start
    #[account(
        mut,
        constraint = pool.authority == authority.key() @ ArisanError::Unauthorized,
        constraint = pool.status == PoolStatus::Pending @ ArisanError::PoolAlreadyStarted,
        constraint = pool.member_count >= 2 @ ArisanError::NotEnoughMembers,
    )]
    pub pool: Account<'info, Pool>,
}

/// Handler for start_pool instruction
pub fn handler(ctx: Context<StartPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Activate the pool
    pool.status = PoolStatus::Active;
    pool.current_round = 1;

    // Set next draw timestamp
    // DEVNET: 5 minutes for testing (300 seconds)
    // MAINNET: Change to 30 days (2,592,000 seconds) before production
    const DRAW_INTERVAL: i64 = 300; // 5 minutes for devnet testing
    // const DRAW_INTERVAL: i64 = 2_592_000; // 30 days for mainnet
    pool.next_draw_timestamp = clock.unix_timestamp.checked_add(DRAW_INTERVAL)
        .ok_or(ArisanError::Overflow)?;

    // Emit event
    emit!(PoolStarted {
        pool: pool.key(),
        authority: ctx.accounts.authority.key(),
        member_count: pool.member_count,
        first_draw_timestamp: pool.next_draw_timestamp,
    });

    msg!("Pool {} started with {} members. First draw at {}",
        pool.key(),
        pool.member_count,
        pool.next_draw_timestamp
    );

    Ok(())
}

/// Event emitted when a pool is started
#[event]
pub struct PoolStarted {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub member_count: u8,
    pub first_draw_timestamp: i64,
}
