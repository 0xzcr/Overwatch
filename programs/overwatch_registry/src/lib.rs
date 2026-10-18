//! Overwatch risk registry.
//!
//! Offchain Overwatch publishers write a `RiskRecord` per protocol (PDA `["risk", sha256(slug)]`).
//! Any program can read it by account (owner check + PDA check) — see `overwatch_vault::check_and_exit`.
//! Trust model: the registry admin (a Squads multisig on devnet) chooses up to 5 publisher keys.
use anchor_lang::prelude::*;

declare_id!("ZCq8qg8ALrZp4FtKra2FERRREWU8c5bu75EQ9CR3q1X");

pub const CONFIG_SEED: &[u8] = b"config";
pub const RISK_SEED: &[u8] = b"risk";
pub const MAX_PUBLISHERS: usize = 5;

/// Flag bits (mirrors packages/core/src/scoring.ts).
pub mod flags {
    pub const SINGLE_KEY: u64 = 1 << 0;
    pub const NO_TIMELOCK: u64 = 1 << 1;
    pub const LOW_THRESHOLD: u64 = 1 << 2;
    pub const CONTROLLED_MULTISIG: u64 = 1 << 3;
    pub const SIGNER_NONCE: u64 = 1 << 4;
    pub const PENDING_WEAKENING: u64 = 1 << 5;
    pub const RECENT_WEAKENING: u64 = 1 << 6;
    pub const RISKY_COLLATERAL: u64 = 1 << 7;
    pub const DEPRECATED_ORACLE: u64 = 1 << 8;
    pub const UNVERIFIED: u64 = 1 << 9;
    pub const NO_TIMELOCK_LOW_THRESHOLD: u64 = 1 << 10;
    pub const RECENT_CRITICAL: u64 = 1 << 11;
    /// Any of these ⇒ red.
    pub const RED_MASK: u64 =
        SINGLE_KEY | SIGNER_NONCE | NO_TIMELOCK_LOW_THRESHOLD | RECENT_CRITICAL;
}

#[program]
pub mod overwatch_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = admin;
        c.publishers = [Pubkey::default(); MAX_PUBLISHERS];
        c.publisher_count = 0;
        c.paused = false;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn add_publisher(ctx: Context<AdminOnly>, publisher: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        require!(!c.is_publisher(&publisher), RegistryError::AlreadyPublisher);
        require!(
            (c.publisher_count as usize) < MAX_PUBLISHERS,
            RegistryError::TooManyPublishers
        );
        let i = c.publisher_count as usize;
        c.publishers[i] = publisher;
        c.publisher_count += 1;
        Ok(())
    }

    pub fn remove_publisher(ctx: Context<AdminOnly>, publisher: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        let n = c.publisher_count as usize;
        let i = c.publishers[..n]
            .iter()
            .position(|p| *p == publisher)
            .ok_or(RegistryError::NotPublisher)?;
        c.publishers[i] = c.publishers[n - 1];
        c.publishers[n - 1] = Pubkey::default();
        c.publisher_count -= 1;
        Ok(())
    }

    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.config.admin = new_admin;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    pub fn upsert_risk(
        ctx: Context<UpsertRisk>,
        protocol_id: [u8; 32],
        score: u8,
        grade: u8,
        flags: u64,
        last_event_slot: u64,
    ) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(!c.paused, RegistryError::Paused);
        require!(
            c.is_publisher(&ctx.accounts.publisher.key()),
            RegistryError::NotPublisher
        );
        require!(score <= 100, RegistryError::InvalidScore);
        require!(grade <= 4, RegistryError::InvalidGrade);
        let r = &mut ctx.accounts.risk;
        if r.version > 0 {
            require!(
                last_event_slot >= r.last_event_slot,
                RegistryError::StaleUpdate
            );
        }
        r.protocol_id = protocol_id;
        r.score = score;
        r.grade = grade;
        r.flags = flags;
        r.last_event_slot = last_event_slot;
        r.updated_slot = Clock::get()?.slot;
        r.publisher = ctx.accounts.publisher.key();
        r.version = r
            .version
            .checked_add(1)
            .ok_or(RegistryError::InvalidScore)?;
        r.bump = ctx.bumps.risk;
        emit!(RiskUpdated {
            protocol_id,
            score,
            grade,
            flags,
            last_event_slot,
            red: flags & flags::RED_MASK != 0,
            version: r.version
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RegistryError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(protocol_id: [u8; 32])]
pub struct UpsertRisk<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(init_if_needed, payer = publisher, space = 8 + RiskRecord::INIT_SPACE, seeds = [RISK_SEED, protocol_id.as_ref()], bump)]
    pub risk: Account<'info, RiskRecord>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub publishers: [Pubkey; MAX_PUBLISHERS],
    pub publisher_count: u8,
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub fn is_publisher(&self, k: &Pubkey) -> bool {
        self.publishers[..self.publisher_count as usize].contains(k)
    }
}

#[account]
#[derive(InitSpace)]
pub struct RiskRecord {
    pub protocol_id: [u8; 32],
    pub score: u8,
    /// 0=A 1=B 2=C 3=D 4=F
    pub grade: u8,
    pub flags: u64,
    pub last_event_slot: u64,
    pub updated_slot: u64,
    pub publisher: Pubkey,
    pub version: u32,
    pub bump: u8,
}

impl RiskRecord {
    pub fn is_red(&self) -> bool {
        self.flags & flags::RED_MASK != 0
    }
}

#[event]
pub struct RiskUpdated {
    pub protocol_id: [u8; 32],
    pub score: u8,
    pub grade: u8,
    pub flags: u64,
    pub last_event_slot: u64,
    pub red: bool,
    pub version: u32,
}

#[error_code]
pub enum RegistryError {
    #[msg("signer is not the registry admin")]
    Unauthorized,
    #[msg("signer is not an authorized publisher")]
    NotPublisher,
    #[msg("publisher already registered")]
    AlreadyPublisher,
    #[msg("publisher list is full")]
    TooManyPublishers,
    #[msg("registry is paused")]
    Paused,
    #[msg("update is older than the stored record")]
    StaleUpdate,
    #[msg("score must be 0-100")]
    InvalidScore,
    #[msg("grade must be 0-4")]
    InvalidGrade,
}
