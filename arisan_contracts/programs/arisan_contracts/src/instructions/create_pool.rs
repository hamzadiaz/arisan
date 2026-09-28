use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::set_return_data;

use crate::state::{Pool, Currency, PoolStatus, CreatorStats};
use crate::errors::ArisanError;

/// Create Pool Instruction (SOL-only for now, SPL tokens added later)
///
/// This is like a constructor in Solidity, but for creating pool "instances".
/// Each pool is a separate account on Solana.
///
/// Key Differences from Solidity:
/// - Accounts must be passed explicitly (no implicit storage)
/// - PDAs replace contract addresses for deterministic derivation
/// - Rent must be paid to keep accounts alive
///
/// Flow:
/// 1. Derive PDA for new Pool account
/// 2. Initialize Pool with settings
/// 3. Create SOL vault PDA
#[derive(Accounts)]
#[instruction(
    name: String,
    max_members: u8,
    contribution_amount: u64,
    currency: u8,
    stake_multiplier: u8,
    stake_enabled: bool,
    auto_mode: bool,
)]
pub struct CreatePool<'info> {
    /// Pool creator - pays for account creation and signs
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Creator stats account - tracks pool count for unique indices
    /// init_if_needed creates it on first pool, reuses on subsequent
    #[account(
        init_if_needed,
        payer = authority,
        space = CreatorStats::SPACE,
        seeds = [CreatorStats::SEED_PREFIX, authority.key().as_ref()],
        bump,
    )]
    pub creator_stats: Account<'info, CreatorStats>,

    /// New Pool account - PDA derived from creator + pool index
    /// The index ensures each creator can make multiple pools
    #[account(
        init,
        payer = authority,
        space = Pool::SPACE,
        seeds = [
            Pool::SEED_PREFIX,
            authority.key().as_ref(),
            &creator_stats.pool_count.to_le_bytes(),
        ],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    /// SOL Vault - PDA that holds SOL contributions
    /// CHECK: This is a PDA we control, validated by seeds
    #[account(
        seeds = [Pool::VAULT_SEED_PREFIX, pool.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// System program for creating accounts
    pub system_program: Program<'info, System>,
}

/// Handler for create_pool instruction
pub fn handler(
    ctx: Context<CreatePool>,
    name: String,
    max_members: u8,
    contribution_amount: u64,
    currency: u8,
    stake_multiplier: u8,
    stake_enabled: bool,
    auto_mode: bool,
) -> Result<()> {
    // Validation (like require() in Solidity)
    require!(name.len() <= 32, ArisanError::NameTooLong);
    require!(max_members >= 2 && max_members <= 20, ArisanError::InvalidMemberCount);
    require!(contribution_amount > 0, ArisanError::InvalidContributionAmount);
    require!(stake_multiplier >= 1 && stake_multiplier <= 3, ArisanError::InvalidStakeMultiplier);
    require!(currency <= 2, ArisanError::InvalidCurrency); // 0=SOL, 1=USDC, 2=USDT

    let pool = &mut ctx.accounts.pool;
    let creator_stats = &mut ctx.accounts.creator_stats;
    let clock = Clock::get()?;

    // Convert currency u8 to enum
    let currency_enum = match currency {
        0 => Currency::Sol,
        1 => Currency::Usdc,
        2 => Currency::Usdt,
        _ => return Err(ArisanError::InvalidCurrency.into()),
    };

    // Convert name to fixed-size array (like bytes32 in Solidity)
    let mut name_bytes = [0u8; 32];
    let name_slice = name.as_bytes();
    let copy_len = name_slice.len().min(32);
    name_bytes[..copy_len].copy_from_slice(&name_slice[..copy_len]);

    // Generate invite code (8 alphanumeric chars)
    // Using clock + authority for pseudo-randomness (VRF will be used for draws)
    let invite_code = generate_invite_code(&ctx.accounts.authority.key(), clock.unix_timestamp);

    // Initialize pool state
    pool.authority = ctx.accounts.authority.key();
    pool.name = name_bytes;
    pool.max_members = max_members;
    pool.member_count = 0; // Creator joins separately
    pool.contribution_amount = contribution_amount;
    pool.currency = currency_enum;
    pool.total_rounds = max_members;
    pool.current_round = 0;
    pool.status = PoolStatus::Pending;
    pool.next_draw_timestamp = 0; // Set when pool starts
    // Hash the invite code with SHA256 for secure storage (plaintext emitted in event)
    pool.invite_code_hash = hash(&invite_code).to_bytes();
    pool.stake_multiplier = stake_multiplier;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.vault;
    pool.created_at = clock.unix_timestamp;
    pool.pool_index = creator_stats.pool_count;
    pool.token_vault = Pubkey::default(); // Will be set when SPL token support is added
    pool.stake_enabled = stake_enabled;
    pool.grace_period_seconds = 172800; // 48 hours default
    pool.auto_mode = auto_mode;

    // Increment creator's pool count (store bump on first creation)
    creator_stats.pool_count = creator_stats.pool_count.checked_add(1)
        .ok_or(ArisanError::Overflow)?;
    if creator_stats.bump == 0 {
        creator_stats.bump = ctx.bumps.creator_stats;
    }

    // The creator reads this from transaction return data. It is not a log line
    // and not an event field, so program logs do not contain the plaintext code.
    set_return_data(&invite_code);

    emit!(PoolCreated {
        pool: pool.key(),
        authority: pool.authority,
        name: name,
        max_members,
        contribution_amount,
        currency: currency_enum,
        stake_enabled,
        auto_mode,
    });

    msg!("Pool created: {}", pool.key());

    Ok(())
}

/// Generate pseudo-random invite code
/// Not cryptographically secure, but sufficient for invite codes
fn generate_invite_code(authority: &Pubkey, timestamp: i64) -> [u8; 8] {
    let mut code = [0u8; 8];
    let auth_bytes = authority.to_bytes();
    let ts_bytes = timestamp.to_le_bytes();

    // Mix authority pubkey with timestamp
    for i in 0..8 {
        let mixed = auth_bytes[i] ^ auth_bytes[i + 8] ^ ts_bytes[i % 8];
        // Convert to alphanumeric (A-Z, 0-9)
        code[i] = match mixed % 36 {
            0..=9 => b'0' + (mixed % 10),
            10..=35 => b'A' + (mixed % 26),
            _ => b'X',
        };
    }
    code
}

/// Event emitted when a pool is created
#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub max_members: u8,
    pub contribution_amount: u64,
    pub currency: Currency,
    pub stake_enabled: bool,
    pub auto_mode: bool,
}
