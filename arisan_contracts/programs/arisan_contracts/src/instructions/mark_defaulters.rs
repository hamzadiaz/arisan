use anchor_lang::prelude::*;

use crate::errors::ArisanError;
use crate::state::{Member, Payment, Pool, PoolStatus};

/// Mark one member who missed the current round.
///
/// `payment` is the canonical Payment PDA for `(pool, member, current_round)`.
/// If that account exists, the member has paid and cannot be slashed.
/// The caller does not pass a paid/unpaid flag.
#[derive(Accounts)]
pub struct MarkDefaulter<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = pool.status == PoolStatus::Active @ ArisanError::PoolNotActive,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [Member::SEED_PREFIX, pool.key().as_ref(), member.wallet.as_ref()],
        bump = member.bump,
        constraint = member.pool == pool.key() @ ArisanError::NotMember,
    )]
    pub member: Account<'info, Member>,

    /// CHECK: Payment PDA for this member and the current round.
    /// Empty when the member has not paid. Seeds bind the address.
    #[account(
        seeds = [
            Payment::SEED_PREFIX,
            pool.key().as_ref(),
            member.wallet.as_ref(),
            &[pool.current_round],
        ],
        bump,
    )]
    pub payment: UncheckedAccount<'info>,

    /// CHECK: Vault PDA, validated by seeds.
    #[account(
        mut,
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MarkDefaulter>) -> Result<()> {
    let clock = Clock::get()?;
    let has_paid = payment_exists(&ctx.accounts.payment)?;

    if has_paid {
        return err!(ArisanError::MemberAlreadyPaid);
    }

    let pool = &mut ctx.accounts.pool;
    let member = &mut ctx.accounts.member;

    if member.is_kicked {
        return Ok(());
    }

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
        return Ok(());
    }

    if !member.in_grace_period {
        require!(
            clock.unix_timestamp > pool.next_draw_timestamp,
            ArisanError::RoundNotDue
        );

        if pool.stake_enabled && member.stake_deposited {
            member.stake_deposited = false;
            member.stake_amount = 0;
            member.in_default = true;

            emit!(StakeSlashed {
                pool: pool.key(),
                member: member.wallet,
                round: pool.current_round,
            });
        }

        member.in_grace_period = true;
        member.grace_deadline = clock
            .unix_timestamp
            .checked_add(pool.grace_period_seconds)
            .ok_or(ArisanError::Overflow)?;

        emit!(GracePeriodStarted {
            pool: pool.key(),
            member: member.wallet,
            deadline: member.grace_deadline,
            stake_slashed: pool.stake_enabled && member.in_default,
        });
    }

    Ok(())
}

fn payment_exists(payment: &AccountInfo) -> Result<bool> {
    if payment.data_is_empty() {
        return Ok(false);
    }
    require!(
        payment.owner == &crate::ID,
        ArisanError::InvalidPaymentAccount
    );
    let data = payment.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    Payment::try_deserialize(&mut slice).map_err(|_| error!(ArisanError::InvalidPaymentAccount))?;
    Ok(true)
}

#[event]
pub struct StakeSlashed {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub round: u8,
}

#[event]
pub struct GracePeriodStarted {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub deadline: i64,
    pub stake_slashed: bool,
}

#[event]
pub struct MemberKicked {
    pub pool: Pubkey,
    pub member: Pubkey,
    pub reason: String,
    pub missed_rounds: u8,
}
