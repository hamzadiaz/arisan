use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::state::{Pool, Member, Draw, PoolStatus};
use crate::errors::ArisanError;

/// Execute Draw Instruction
///
/// Selects a winner for the current round and AUTO-PAYS them immediately.
/// Can be triggered by pool authority OR anyone after the deadline (for Clockwork automation).
///
/// IMPORTANT: For devnet, this uses pseudo-randomness (slot hash).
/// For mainnet, integrate Switchboard VRF for true verifiable randomness.
///
/// Key concepts for Solidity devs:
/// - Winner gets paid automatically in this transaction (no separate claim needed)
/// - Pool authority can execute anytime, anyone can execute after deadline
/// - Round advances automatically after winner is paid
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    /// Pool authority OR anyone after deadline (for Clockwork automation)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The pool (must be Active)
    /// Authority check: pool.authority can execute anytime, anyone can execute after deadline
    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// Winner's Member account - must be verified as eligible
    /// (hasn't won yet, is a member, not in default, not kicked, not in grace period)
    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), winner_wallet.key().as_ref()],
        bump = winner_member.bump,
        constraint = winner_member.pool == pool.key() @ ArisanError::NotMember,
        constraint = !winner_member.has_won @ ArisanError::AlreadyWon,
        constraint = !winner_member.in_default @ ArisanError::MemberInDefault,
        constraint = !winner_member.is_kicked @ ArisanError::MemberKicked,
        constraint = !winner_member.in_grace_period @ ArisanError::MemberInGracePeriod,
    )]
    pub winner_member: Account<'info, Member>,

    /// Winner's wallet - receives winnings automatically (must be mutable)
    /// CHECK: Validated by PDA derivation with winner_member
    #[account(mut)]
    pub winner_wallet: UncheckedAccount<'info>,

    /// Draw record - created for this round
    #[account(
        init,
        payer = authority,
        space = Draw::SPACE,
        seeds = [Draw::SEED_PREFIX, pool.key().as_ref(), &[pool.current_round]],
        bump,
    )]
    pub draw: Account<'info, Draw>,

    /// SOL Vault - holds the winnings to transfer
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

/// Handler for execute_draw instruction with AUTO-PAY
///
/// The authority passes in the selected winner. In production:
/// 1. VRF request is made to Switchboard
/// 2. VRF callback provides randomness
/// 3. Winner is selected deterministically from randomness
///
/// For devnet: We generate pseudo-randomness and verify the winner is eligible
/// Winner is paid automatically in this transaction (no separate claim needed)
pub fn handler(ctx: Context<ExecuteDraw>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let winner_member = &mut ctx.accounts.winner_member;
    let draw = &mut ctx.accounts.draw;
    let clock = Clock::get()?;

    // Permission check: pool authority can execute anytime, anyone can execute after deadline
    let is_authority = pool.authority == ctx.accounts.authority.key();
    let is_past_deadline = clock.unix_timestamp > pool.next_draw_timestamp;

    require!(
        is_authority || is_past_deadline,
        ArisanError::Unauthorized
    );

    // Generate pseudo-random seed (for devnet testing)
    // In production, this would come from Switchboard VRF
    let vrf_result = generate_pseudo_random(
        &pool.key(),
        pool.current_round,
        clock.slot,
        clock.unix_timestamp,
    );

    // Calculate winnings: contribution * member_count
    let winnings = pool.contribution_amount
        .checked_mul(pool.member_count as u64)
        .ok_or(ArisanError::Overflow)?;

    // Initialize draw record
    let current_round = pool.current_round;
    draw.pool = pool.key();
    draw.round = current_round;
    draw.winner = ctx.accounts.winner_wallet.key();
    draw.amount = winnings;
    draw.vrf_result = vrf_result;
    draw.drawn_at = clock.unix_timestamp;
    draw.bump = ctx.bumps.draw;

    // Update winner's member record
    winner_member.has_won = true;
    winner_member.won_round = current_round;

    // ========== AUTO-PAY: Transfer winnings to winner ==========
    let pool_key = pool.key();
    let vault_seeds: &[&[u8]] = &[
        Pool::VAULT_SEED_PREFIX,
        pool_key.as_ref(),
        &[pool.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.winner_wallet.key(),
        winnings,
    );

    invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.winner_wallet.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Mark as claimed (auto-paid)
    draw.claimed = true;

    // ========== ROUND ADVANCEMENT (moved from claim_winnings) ==========
    let pool_completed: bool;
    if pool.current_round < pool.total_rounds {
        pool.current_round = pool.current_round.checked_add(1)
            .ok_or(ArisanError::Overflow)?;

        // Set next draw timestamp
        // DEVNET: 5 minutes for testing | MAINNET: Change to 2_592_000 (30 days)
        const DRAW_INTERVAL: i64 = 300; // 5 minutes
        pool.next_draw_timestamp = clock.unix_timestamp.checked_add(DRAW_INTERVAL)
            .ok_or(ArisanError::Overflow)?;

        pool_completed = false;
    } else {
        // Final round - pool is complete
        pool.status = PoolStatus::Completed;
        pool_completed = true;
    }

    // Emit event
    emit!(DrawExecutedAndPaid {
        pool: pool_key,
        round: current_round,
        winner: ctx.accounts.winner_wallet.key(),
        amount: winnings,
        vrf_result,
        next_round: pool.current_round,
        pool_completed,
    });

    msg!("Draw executed and paid for round {}. Winner: {} Amount: {} Next round: {}",
        current_round,
        ctx.accounts.winner_wallet.key(),
        winnings,
        pool.current_round
    );

    Ok(())
}

/// Generate pseudo-random bytes for devnet testing
/// NOT SECURE - do not use on mainnet
fn generate_pseudo_random(
    pool: &Pubkey,
    round: u8,
    slot: u64,
    timestamp: i64,
) -> [u8; 32] {
    let mut result = [0u8; 32];
    let pool_bytes = pool.to_bytes();
    let slot_bytes = slot.to_le_bytes();
    let ts_bytes = timestamp.to_le_bytes();

    // Mix inputs
    for i in 0..32 {
        result[i] = pool_bytes[i]
            ^ slot_bytes[i % 8]
            ^ ts_bytes[i % 8]
            ^ (round.wrapping_mul(17));
    }

    result
}

/// Event emitted when a draw is executed and winner is paid
#[event]
pub struct DrawExecutedAndPaid {
    pub pool: Pubkey,
    pub round: u8,
    pub winner: Pubkey,
    pub amount: u64,
    pub vrf_result: [u8; 32],
    pub next_round: u8,
    pub pool_completed: bool,
}
