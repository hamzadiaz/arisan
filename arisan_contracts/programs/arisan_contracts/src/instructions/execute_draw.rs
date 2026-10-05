use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::draw_randomness::{self, MAX_SLOT_HASH_AGE};
use crate::errors::ArisanError;
use crate::state::{Draw, Member, Payment, Pool, PoolStatus};

/// Commit the landing slot for this round's draw.
///
/// The hash of `clock.slot` is not in SlotHashes until a later slot, so the
/// signer cannot know the winner when this transaction is built.
#[derive(Accounts)]
pub struct CommitDrawRandomness<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,
}

/// Execute the committed draw and pay the derived winner.
///
/// `winner_wallet` is checked against the member selected from the slot hash.
/// Passing any other wallet fails. Remaining accounts must contain the full
/// roster of member PDAs followed by the current-round Payment PDAs in the
/// same order; their order is not an input to selection.
#[derive(Accounts)]
pub struct ExecuteDraw<'info> {
    /// Pool authority, or anyone after the draw deadline.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Must be the wallet derived from the committed slot hash.
    #[account(mut)]
    pub winner_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = Draw::SPACE,
        seeds = [Draw::SEED_PREFIX, pool.key().as_ref(), &[pool.current_round]],
        bump,
    )]
    pub draw: Account<'info, Draw>,

    /// CHECK: Vault PDA, validated by seeds.
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: SlotHashes sysvar. Address is constrained.
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
}

pub fn commit_handler(ctx: Context<CommitDrawRandomness>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    let is_authority = pool.authority == ctx.accounts.caller.key();
    let is_past_deadline = clock.unix_timestamp > pool.next_draw_timestamp;
    require!(is_authority || is_past_deadline, ArisanError::Unauthorized);
    require!(pool.current_round >= 1, ArisanError::DrawNotReady);
    require!(
        pool.randomness_round != pool.current_round,
        ArisanError::RandomnessAlreadyCommitted
    );

    pool.randomness_slot = clock.slot;
    pool.randomness_round = pool.current_round;

    emit!(DrawRandomnessCommitted {
        pool: pool.key(),
        round: pool.current_round,
        slot: pool.randomness_slot,
    });

    Ok(())
}

pub fn handler(ctx: Context<ExecuteDraw>) -> Result<()> {
    let clock = Clock::get()?;

    let (pool_key, winner_key, vrf_result, winnings, current_round, vault_bump) = {
        let pool = &ctx.accounts.pool;

        let is_authority = pool.authority == ctx.accounts.authority.key();
        let is_past_deadline = clock.unix_timestamp > pool.next_draw_timestamp;
        require!(is_authority || is_past_deadline, ArisanError::Unauthorized);
        require!(
            pool.randomness_round == pool.current_round,
            ArisanError::RandomnessNotCommitted
        );
        require!(
            clock.slot > pool.randomness_slot,
            ArisanError::RandomnessNotReady
        );

        let slot_hash_data = ctx.accounts.slot_hashes.try_borrow_data()?;
        let vrf_result = match draw_randomness::read_slot_hash(&slot_hash_data, pool.randomness_slot)
        {
            Some(hash) => hash,
            None if clock.slot > pool.randomness_slot.saturating_add(MAX_SLOT_HASH_AGE) => {
                return err!(ArisanError::RandomnessExpired);
            }
            None => return err!(ArisanError::RandomnessNotReady),
        };
        drop(slot_hash_data);

        let pool_key = pool.key();
        let roster_len = pool.roster_len as usize;
        require!(
            ctx.remaining_accounts.len() == roster_len * 2,
            ArisanError::InvalidMemberSet
        );
        let (member_accounts, payment_accounts) = ctx.remaining_accounts.split_at(roster_len);
        let mut eligible = load_eligible_wallets(pool, &pool_key, member_accounts)?;
        require_current_round_payments(
            pool,
            &pool_key,
            member_accounts,
            payment_accounts,
        )?;
        let winner_key = draw_randomness::select_winner(&vrf_result, &mut eligible)
            .ok_or(ArisanError::NoEligibleMembers)?;

        let winnings = pool
            .contribution_amount
            .checked_mul(pool.member_count as u64)
            .ok_or(ArisanError::Overflow)?;

        (
            pool_key,
            winner_key,
            vrf_result,
            winnings,
            pool.current_round,
            pool.vault_bump,
        )
    };

    require_keys_eq!(
        ctx.accounts.winner_wallet.key(),
        winner_key,
        ArisanError::WinnerMismatch
    );
    require_keys_neq!(
        ctx.accounts.winner_wallet.key(),
        ctx.accounts.vault.key(),
        ArisanError::WinnerMismatch
    );

    let (winner_pda, _) = Pubkey::find_program_address(
        &[
            Member::SEED_PREFIX,
            pool_key.as_ref(),
            winner_key.as_ref(),
        ],
        &crate::ID,
    );
    let winner_info = ctx
        .remaining_accounts
        .iter()
        .find(|account| account.key() == winner_pda)
        .ok_or(ArisanError::InvalidMemberSet)?;
    mark_winner(winner_info, current_round)?;

    let draw = &mut ctx.accounts.draw;
    draw.pool = pool_key;
    draw.round = current_round;
    draw.winner = winner_key;
    draw.amount = winnings;
    draw.vrf_result = vrf_result;
    draw.drawn_at = clock.unix_timestamp;
    draw.bump = ctx.bumps.draw;
    draw.claimed = true;

    let vault_seeds: &[&[u8]] = &[
        Pool::VAULT_SEED_PREFIX,
        pool_key.as_ref(),
        &[vault_bump],
    ];
    invoke_signed(
        &system_instruction::transfer(
            &ctx.accounts.vault.key(),
            &winner_key,
            winnings,
        ),
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.winner_wallet.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[vault_seeds],
    )?;

    let pool = &mut ctx.accounts.pool;
    let pool_completed = advance_round(pool, clock.unix_timestamp)?;

    emit!(DrawExecutedAndPaid {
        pool: pool_key,
        round: current_round,
        winner: winner_key,
        amount: winnings,
        vrf_result,
        next_round: pool.current_round,
        pool_completed,
    });

    Ok(())
}

fn advance_round(pool: &mut Pool, now: i64) -> Result<bool> {
    if pool.current_round < pool.total_rounds {
        pool.current_round = pool
            .current_round
            .checked_add(1)
            .ok_or(ArisanError::Overflow)?;
        // DEVNET: 5 minutes. MAINNET: 2_592_000 (30 days).
        const DRAW_INTERVAL: i64 = 300;
        pool.next_draw_timestamp = now
            .checked_add(DRAW_INTERVAL)
            .ok_or(ArisanError::Overflow)?;
        // The previous commit must not authorize the next round.
        pool.randomness_round = 0;
        pool.randomness_slot = 0;
        Ok(false)
    } else {
        pool.status = PoolStatus::Completed;
        pool.randomness_round = 0;
        pool.randomness_slot = 0;
        Ok(true)
    }
}

/// Every roster wallet must be present exactly once. Eligible wallets are
/// those still able to win this round.
fn load_eligible_wallets(
    pool: &Pool,
    pool_key: &Pubkey,
    remaining: &[AccountInfo],
) -> Result<Vec<Pubkey>> {
    let roster_len = pool.roster_len as usize;
    require!(roster_len > 0, ArisanError::NoEligibleMembers);
    require!(
        remaining.len() == roster_len,
        ArisanError::InvalidMemberSet
    );

    let mut seen = [false; 20];
    let mut eligible = Vec::with_capacity(roster_len);

    for info in remaining {
        require!(
            info.owner == &crate::ID,
            ArisanError::InvalidMemberSet
        );
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

        let can_win = !member.has_won
            && !member.in_default
            && !member.is_kicked
            && !member.in_grace_period;
        if can_win {
            eligible.push(member.wallet);
        }
    }

    require!(
        seen[..roster_len].iter().all(|present| *present),
        ArisanError::InvalidMemberSet
    );

    Ok(eligible)
}

fn require_current_round_payments(
    pool: &Pool,
    pool_key: &Pubkey,
    member_accounts: &[AccountInfo],
    payment_accounts: &[AccountInfo],
) -> Result<()> {
    for (member_info, payment_info) in member_accounts.iter().zip(payment_accounts) {
        let member_data = member_info.try_borrow_data()?;
        let mut member_slice: &[u8] = &member_data;
        let member = Member::try_deserialize(&mut member_slice)
            .map_err(|_| error!(ArisanError::InvalidMemberSet))?;
        drop(member_data);

        if payment_info.owner != &crate::ID {
            return err!(ArisanError::RoundNotFullyPaid);
        }
        let (payment_pda, _) = Pubkey::find_program_address(
            &[
                Payment::SEED_PREFIX,
                pool_key.as_ref(),
                member.wallet.as_ref(),
                &[pool.current_round],
            ],
            &crate::ID,
        );
        require_keys_eq!(
            payment_info.key(),
            payment_pda,
            ArisanError::InvalidPaymentAccount
        );

        let payment_data = payment_info.try_borrow_data()?;
        let mut payment_slice: &[u8] = &payment_data;
        let payment = Payment::try_deserialize(&mut payment_slice)
            .map_err(|_| error!(ArisanError::InvalidPaymentAccount))?;
        require_keys_eq!(payment.pool, *pool_key, ArisanError::InvalidPaymentAccount);
        require_keys_eq!(
            payment.member,
            member.wallet,
            ArisanError::InvalidPaymentAccount
        );
        require!(
            payment.round == pool.current_round
                && payment.amount == pool.contribution_amount,
            ArisanError::RoundNotFullyPaid
        );
    }
    Ok(())
}

fn mark_winner(info: &AccountInfo, round: u8) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut member = {
        let mut slice: &[u8] = &data;
        Member::try_deserialize(&mut slice).map_err(|_| error!(ArisanError::InvalidMemberSet))?
    };
    member.has_won = true;
    member.won_round = round;
    let mut cursor = &mut data[..];
    member.try_serialize(&mut cursor)?;
    Ok(())
}

#[event]
pub struct DrawRandomnessCommitted {
    pub pool: Pubkey,
    pub round: u8,
    pub slot: u64,
}

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
