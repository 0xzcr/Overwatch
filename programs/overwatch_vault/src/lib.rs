//! DEMO vault. Positions are SIMULATED allocations (token accounts held by the vault), not real protocol integrations.
//! `check_and_exit` is permissionless: anyone can pull a position back to idle when the protocol's
//! Overwatch `RiskRecord` is red (`flags & RED_MASK != 0`) or its score is below `vault.min_score`.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Burn, Token, TokenAccount, Transfer};
use overwatch_registry::{flags::RED_MASK, RiskRecord, RISK_SEED};

declare_id!("9HyNZKXgyJzCoSq3PQ16etGn7eC4ZDauTuRUUe9Jef5A");

pub const VAULT_SEED: &[u8] = b"vault";
pub const IDLE_SEED: &[u8] = b"idle";
pub const SHARES_SEED: &[u8] = b"shares";
pub const POSITION_SEED: &[u8] = b"position";
pub const POSITION_TOKENS_SEED: &[u8] = b"position_tokens";

#[program]
pub mod overwatch_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, min_score: u8) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.manager = ctx.accounts.manager.key();
        v.mint = ctx.accounts.mint.key();
        v.share_mint = ctx.accounts.share_mint.key();
        v.idle = ctx.accounts.idle.key();
        v.total_allocated = 0;
        v.min_score = min_score;
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        let assets = ctx.accounts.vault.total_assets(ctx.accounts.idle.amount)?;
        let supply = ctx.accounts.share_mint.supply;
        let shares = shares_for_deposit(amount, assets, supply)?;
        token::transfer(CpiContext::new(ctx.accounts.token_program.key(), Transfer {
            from: ctx.accounts.user_tokens.to_account_info(), to: ctx.accounts.idle.to_account_info(), authority: ctx.accounts.user.to_account_info(),
        }), amount)?;
        let mint = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint.as_ref(), &[ctx.accounts.vault.bump]];
        token::mint_to(CpiContext::new_with_signer(ctx.accounts.token_program.key(), MintTo {
            mint: ctx.accounts.share_mint.to_account_info(), to: ctx.accounts.user_shares.to_account_info(), authority: ctx.accounts.vault.to_account_info(),
        }, &[seeds]), shares)?;
        emit!(Deposited { user: ctx.accounts.user.key(), amount, shares });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        require!(shares > 0, VaultError::ZeroAmount);
        let assets = ctx.accounts.vault.total_assets(ctx.accounts.idle.amount)?;
        let amount = assets_for_shares(shares, assets, ctx.accounts.share_mint.supply)?;
        require!(amount <= ctx.accounts.idle.amount, VaultError::InsufficientIdle);
        token::burn(CpiContext::new(ctx.accounts.token_program.key(), Burn {
            mint: ctx.accounts.share_mint.to_account_info(), from: ctx.accounts.user_shares.to_account_info(), authority: ctx.accounts.user.to_account_info(),
        }), shares)?;
        let mint = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint.as_ref(), &[ctx.accounts.vault.bump]];
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
            from: ctx.accounts.idle.to_account_info(), to: ctx.accounts.user_tokens.to_account_info(), authority: ctx.accounts.vault.to_account_info(),
        }, &[seeds]), amount)?;
        emit!(Withdrawn { user: ctx.accounts.user.key(), amount, shares });
        Ok(())
    }

    pub fn allocate(ctx: Context<Allocate>, protocol_id: [u8; 32], amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        let p = &mut ctx.accounts.position;
        if p.vault == Pubkey::default() {
            p.vault = ctx.accounts.vault.key();
            p.protocol_id = protocol_id;
            p.token_account = ctx.accounts.position_tokens.key();
            p.bump = ctx.bumps.position;
        }
        require!(!p.shielded, VaultError::PositionShielded);
        let mint = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint.as_ref(), &[ctx.accounts.vault.bump]];
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
            from: ctx.accounts.idle.to_account_info(), to: ctx.accounts.position_tokens.to_account_info(), authority: ctx.accounts.vault.to_account_info(),
        }, &[seeds]), amount)?;
        p.allocated = p.allocated.checked_add(amount).ok_or(VaultError::MathOverflow)?;
        let v = &mut ctx.accounts.vault;
        v.total_allocated = v.total_allocated.checked_add(amount).ok_or(VaultError::MathOverflow)?;
        Ok(())
    }

    /// Manager can re-arm a shielded position once the protocol is no longer red (demo reset).
    pub fn reset_position(ctx: Context<ResetPosition>) -> Result<()> {
        let r = &ctx.accounts.risk;
        require!(!should_exit(r, ctx.accounts.vault.min_score), VaultError::StillRed);
        ctx.accounts.position.shielded = false;
        Ok(())
    }

    /// Permissionless. The `risk` account is typed as the registry's `RiskRecord`, so Anchor checks its owner
    /// is `overwatch_registry`; the seeds constraint checks it's the PDA for this position's protocol_id.
    pub fn check_and_exit(ctx: Context<CheckAndExit>) -> Result<()> {
        let r = &ctx.accounts.risk;
        let p = &mut ctx.accounts.position;
        if p.shielded {
            return Ok(()); // idempotent
        }
        require!(should_exit(r, ctx.accounts.vault.min_score), VaultError::NotRed);
        let amount = ctx.accounts.position_tokens.amount;
        let mint = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint.as_ref(), &[ctx.accounts.vault.bump]];
        if amount > 0 {
            token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
                from: ctx.accounts.position_tokens.to_account_info(), to: ctx.accounts.idle.to_account_info(), authority: ctx.accounts.vault.to_account_info(),
            }, &[seeds]), amount)?;
        }
        let v = &mut ctx.accounts.vault;
        v.total_allocated = v.total_allocated.saturating_sub(p.allocated);
        p.allocated = 0;
        p.shielded = true;
        emit!(ShieldTriggered { vault: v.key(), protocol_id: p.protocol_id, amount, score: r.score, flags: r.flags, caller: ctx.accounts.caller.key() });
        Ok(())
    }
}

pub fn should_exit(r: &RiskRecord, min_score: u8) -> bool {
    r.flags & RED_MASK != 0 || r.score < min_score
}

pub fn shares_for_deposit(amount: u64, total_assets: u64, supply: u64) -> Result<u64> {
    if supply == 0 || total_assets == 0 {
        return Ok(amount);
    }
    let s = (amount as u128) * (supply as u128) / (total_assets as u128);
    require!(s > 0, VaultError::ZeroAmount);
    u64::try_from(s).map_err(|_| error!(VaultError::MathOverflow))
}

pub fn assets_for_shares(shares: u64, total_assets: u64, supply: u64) -> Result<u64> {
    require!(supply > 0 && shares <= supply, VaultError::ZeroAmount);
    u64::try_from((shares as u128) * (total_assets as u128) / (supply as u128)).map_err(|_| error!(VaultError::MathOverflow))
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(init, payer = manager, space = 8 + Vault::INIT_SPACE, seeds = [VAULT_SEED, mint.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = manager, seeds = [SHARES_SEED, vault.key().as_ref()], bump, mint::decimals = mint.decimals, mint::authority = vault)]
    pub share_mint: Account<'info, Mint>,
    #[account(init, payer = manager, seeds = [IDLE_SEED, vault.key().as_ref()], bump, token::mint = mint, token::authority = vault)]
    pub idle: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump, has_one = idle, has_one = share_mint)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub idle: Account<'info, TokenAccount>,
    #[account(mut)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, token::mint = vault.mint, token::authority = user)]
    pub user_tokens: Account<'info, TokenAccount>,
    #[account(mut, token::mint = share_mint, token::authority = user)]
    pub user_shares: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump, has_one = idle, has_one = share_mint)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub idle: Account<'info, TokenAccount>,
    #[account(mut)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, token::mint = vault.mint, token::authority = user)]
    pub user_tokens: Account<'info, TokenAccount>,
    #[account(mut, token::mint = share_mint, token::authority = user)]
    pub user_shares: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(protocol_id: [u8; 32])]
pub struct Allocate<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump, has_one = manager @ VaultError::Unauthorized, has_one = idle, has_one = mint)]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub idle: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = manager, space = 8 + Position::INIT_SPACE, seeds = [POSITION_SEED, vault.key().as_ref(), protocol_id.as_ref()], bump)]
    pub position: Account<'info, Position>,
    #[account(init_if_needed, payer = manager, seeds = [POSITION_TOKENS_SEED, position.key().as_ref()], bump, token::mint = mint, token::authority = vault)]
    pub position_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetPosition<'info> {
    pub manager: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump, has_one = manager @ VaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [POSITION_SEED, vault.key().as_ref(), position.protocol_id.as_ref()], bump = position.bump, has_one = vault)]
    pub position: Account<'info, Position>,
    #[account(seeds = [RISK_SEED, position.protocol_id.as_ref()], bump = risk.bump, seeds::program = overwatch_registry::ID)]
    pub risk: Account<'info, RiskRecord>,
}

#[derive(Accounts)]
pub struct CheckAndExit<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump, has_one = idle)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub idle: Account<'info, TokenAccount>,
    #[account(mut, seeds = [POSITION_SEED, vault.key().as_ref(), position.protocol_id.as_ref()], bump = position.bump, has_one = vault)]
    pub position: Account<'info, Position>,
    #[account(mut, address = position.token_account)]
    pub position_tokens: Account<'info, TokenAccount>,
    /// Owner checked by `Account<RiskRecord>` (must be overwatch_registry); PDA checked by seeds.
    #[account(seeds = [RISK_SEED, position.protocol_id.as_ref()], bump = risk.bump, seeds::program = overwatch_registry::ID)]
    pub risk: Account<'info, RiskRecord>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub manager: Pubkey,
    pub mint: Pubkey,
    pub share_mint: Pubkey,
    pub idle: Pubkey,
    pub total_allocated: u64,
    pub min_score: u8,
    pub bump: u8,
}

impl Vault {
    pub fn total_assets(&self, idle: u64) -> Result<u64> {
        idle.checked_add(self.total_allocated).ok_or(error!(VaultError::MathOverflow))
    }
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub vault: Pubkey,
    pub protocol_id: [u8; 32],
    pub token_account: Pubkey,
    pub allocated: u64,
    pub shielded: bool,
    pub bump: u8,
}

#[event]
pub struct ShieldTriggered {
    pub vault: Pubkey,
    pub protocol_id: [u8; 32],
    pub amount: u64,
    pub score: u8,
    pub flags: u64,
    pub caller: Pubkey,
}

#[event]
pub struct Deposited { pub user: Pubkey, pub amount: u64, pub shares: u64 }
#[event]
pub struct Withdrawn { pub user: Pubkey, pub amount: u64, pub shares: u64 }

#[error_code]
pub enum VaultError {
    #[msg("only the vault manager can do this")]
    Unauthorized,
    #[msg("amount must be > 0")]
    ZeroAmount,
    #[msg("math overflow")]
    MathOverflow,
    #[msg("not enough idle funds; position funds are allocated")]
    InsufficientIdle,
    #[msg("position is shielded")]
    PositionShielded,
    #[msg("protocol risk is not red; nothing to do")]
    NotRed,
    #[msg("protocol is still red")]
    StillRed,
}
