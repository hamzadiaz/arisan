use anchor_lang::prelude::*;

use crate::errors::ArisanError;
use crate::state::{Member, Pool, PoolStatus};

/// Start Pool Instruction
///
/// Allows the pool authority to activate the pool once:
/// 1. The roster is full (`member_count == max_members`)
/// 2. If stake is enabled, every joined member has deposited stake
///    (remaining accounts must be the full roster of member PDAs)
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
        constraint = pool.member_count == pool.max_members @ ArisanError::NotEnoughMembers,
    )]
    pub pool: Account<'info, Pool>,
}

/// Handler for start_pool instruction
pub fn handler(ctx: Context<StartPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    if pool.stake_enabled {
        require_all_members_staked(pool, &pool.key(), ctx.remaining_accounts)?;
    }

    // Activate the pool
    pool.status = PoolStatus::Active;
    pool.current_round = 1;

    // Set next draw timestamp
    // DEVNET: 5 minutes for testing (300 seconds)
    // MAINNET: Change to 30 days (2,592,000 seconds) before production
    const DRAW_INTERVAL: i64 = 300; // 5 minutes for devnet testing
                                    // const DRAW_INTERVAL: i64 = 2_592_000; // 30 days for mainnet
    pool.next_draw_timestamp = clock
        .unix_timestamp
        .checked_add(DRAW_INTERVAL)
        .ok_or(ArisanError::Overflow)?;

    // Emit event
    emit!(PoolStarted {
        pool: pool.key(),
        authority: ctx.accounts.authority.key(),
        member_count: pool.member_count,
        first_draw_timestamp: pool.next_draw_timestamp,
    });

    msg!(
        "Pool {} started with {} members. First draw at {}",
        pool.key(),
        pool.member_count,
        pool.next_draw_timestamp
    );

    Ok(())
}

/// Remaining accounts must be the full roster of member PDAs (order-independent),
/// matching `execute_draw`. Every member must have `stake_deposited`.
fn require_all_members_staked(
    pool: &Pool,
    pool_key: &Pubkey,
    remaining: &[AccountInfo],
) -> Result<()> {
    let roster_len = pool.roster_len as usize;
    require!(
        roster_len == pool.member_count as usize,
        ArisanError::InvalidMemberSet
    );
    require!(roster_len > 0, ArisanError::NotEnoughMembers);
    require!(remaining.len() == roster_len, ArisanError::InvalidMemberSet);

    let mut seen = [false; 20];
    for info in remaining {
        require!(info.owner == &crate::ID, ArisanError::InvalidMemberSet);
        let data = info.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        let member = Member::try_deserialize(&mut slice)
            .map_err(|_| error!(ArisanError::InvalidMemberSet))?;
        drop(data);

        require!(member.pool == *pool_key, ArisanError::NotMember);

        let idx = pool.member_wallets[..roster_len]
            .iter()
            .position(|wallet| *wallet == member.wallet)
            .ok_or(ArisanError::InvalidMemberSet)?;
        require!(!seen[idx], ArisanError::InvalidMemberSet);
        seen[idx] = true;

        let (pda, _) = Pubkey::find_program_address(
            &[
                Member::SEED_PREFIX,
                pool_key.as_ref(),
                member.wallet.as_ref(),
            ],
            &crate::ID,
        );
        require_keys_eq!(info.key(), pda, ArisanError::InvalidMemberSet);
        require!(member.stake_deposited, ArisanError::StakeNotDeposited);
    }

    require!(
        seen[..roster_len].iter().all(|present| *present),
        ArisanError::InvalidMemberSet
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
