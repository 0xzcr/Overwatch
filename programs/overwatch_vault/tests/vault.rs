use {
    anchor_lang::{
        prelude::{AccountMeta, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::token::spl_token,
    litesvm::LiteSVM,
    overwatch_vault::{accounts as acc, instruction as ix, Position, Vault},
    sha2::{Digest, Sha256},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const TOKEN: Pubkey = spl_token::ID;
fn reg() -> Pubkey {
    overwatch_registry::id()
}
fn vid() -> Pubkey {
    overwatch_vault::id()
}

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    user: Keypair,
    mint: Pubkey,
    vault: Pubkey,
    idle: Pubkey,
    shares: Pubkey,
    user_tokens: Pubkey,
    user_shares: Pubkey,
}

fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> Result<Vec<String>, String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
        .map(|m| m.logs)
        .map_err(|e| format!("{:?}", e.meta.logs))
}
fn read<T: AccountDeserialize>(svm: &LiteSVM, k: &Pubkey) -> T {
    T::try_deserialize(&mut &svm.get_account(k).unwrap().data[..]).unwrap()
}
fn token_amount(svm: &LiteSVM, k: &Pubkey) -> u64 {
    u64::from_le_bytes(svm.get_account(k).unwrap().data[64..72].try_into().unwrap())
}
fn pid(s: &str) -> [u8; 32] {
    Sha256::digest(s.as_bytes()).into()
}
fn pda(seeds: &[&[u8]], p: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(seeds, p).0
}
fn risk_pda(p: &[u8; 32]) -> Pubkey {
    pda(&[b"risk", p], &reg())
}
fn pos_pda(vault: &Pubkey, p: &[u8; 32]) -> Pubkey {
    pda(&[b"position", vault.as_ref(), p], &vid())
}
fn pos_tokens(pos: &Pubkey) -> Pubkey {
    pda(&[b"position_tokens", pos.as_ref()], &vid())
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, authority: &Pubkey) -> Pubkey {
    let m = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(82);
    let ixs = [
        anchor_lang::solana_program::system_instruction::create_account(
            &payer.pubkey(),
            &m.pubkey(),
            rent,
            82,
            &TOKEN,
        ),
        spl_token::instruction::initialize_mint2(&TOKEN, &m.pubkey(), authority, None, 6).unwrap(),
    ];
    send(svm, &ixs, &[payer, &m]).unwrap();
    m.pubkey()
}
fn create_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Pubkey {
    let a = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(165);
    let ixs = [
        anchor_lang::solana_program::system_instruction::create_account(
            &payer.pubkey(),
            &a.pubkey(),
            rent,
            165,
            &TOKEN,
        ),
        spl_token::instruction::initialize_account3(&TOKEN, &a.pubkey(), mint, owner).unwrap(),
    ];
    send(svm, &ixs, &[payer, &a]).unwrap();
    a.pubkey()
}

fn setup(min_score: u8) -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program(
        reg(),
        include_bytes!("../../../target/deploy/overwatch_registry.so"),
    )
    .unwrap();
    svm.add_program(
        vid(),
        include_bytes!("../../../target/deploy/overwatch_vault.so"),
    )
    .unwrap();
    let admin = Keypair::new();
    let user = Keypair::new();
    svm.airdrop(&admin.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&user.pubkey(), 2_000_000_000).unwrap();
    let mint = create_mint(&mut svm, &admin, &admin.pubkey());
    let vault = pda(&[b"vault", mint.as_ref()], &vid());
    let idle = pda(&[b"idle", vault.as_ref()], &vid());
    let shares = pda(&[b"shares", vault.as_ref()], &vid());
    send(
        &mut svm,
        &[Instruction::new_with_bytes(
            vid(),
            &ix::InitializeVault { min_score }.data(),
            acc::InitializeVault {
                manager: admin.pubkey(),
                mint,
                vault,
                share_mint: shares,
                idle,
                token_program: TOKEN,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
        &[&admin],
    )
    .unwrap();
    let user_tokens = create_token_account(&mut svm, &admin, &mint, &user.pubkey());
    let user_shares = create_token_account(&mut svm, &admin, &shares, &user.pubkey());
    send(
        &mut svm,
        &[spl_token::instruction::mint_to(
            &TOKEN,
            &mint,
            &user_tokens,
            &admin.pubkey(),
            &[],
            1_000_000,
        )
        .unwrap()],
        &[&admin],
    )
    .unwrap();
    // registry: admin is also publisher
    let cfg = pda(&[b"config"], &reg());
    send(
        &mut svm,
        &[
            Instruction::new_with_bytes(
                reg(),
                &overwatch_registry::instruction::Initialize {
                    admin: admin.pubkey(),
                }
                .data(),
                overwatch_registry::accounts::Initialize {
                    payer: admin.pubkey(),
                    config: cfg,
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
            ),
            Instruction::new_with_bytes(
                reg(),
                &overwatch_registry::instruction::AddPublisher {
                    publisher: admin.pubkey(),
                }
                .data(),
                overwatch_registry::accounts::AdminOnly {
                    admin: admin.pubkey(),
                    config: cfg,
                }
                .to_account_metas(None),
            ),
        ],
        &[&admin],
    )
    .unwrap();
    Env {
        svm,
        admin,
        user,
        mint,
        vault,
        idle,
        shares,
        user_tokens,
        user_shares,
    }
}

impl Env {
    fn publish(&mut self, slug: &str, score: u8, flags: u64, slot: u64) {
        let p = pid(slug);
        let ixn = Instruction::new_with_bytes(
            reg(),
            &overwatch_registry::instruction::UpsertRisk {
                protocol_id: p,
                score,
                grade: 0,
                flags,
                last_event_slot: slot,
            }
            .data(),
            overwatch_registry::accounts::UpsertRisk {
                publisher: self.admin.pubkey(),
                config: pda(&[b"config"], &reg()),
                risk: risk_pda(&p),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        send(&mut self.svm, &[ixn], &[&self.admin]).unwrap();
    }
    fn deposit(&mut self, amount: u64) -> Result<Vec<String>, String> {
        let i = Instruction::new_with_bytes(
            vid(),
            &ix::Deposit { amount }.data(),
            acc::Deposit {
                user: self.user.pubkey(),
                vault: self.vault,
                idle: self.idle,
                share_mint: self.shares,
                user_tokens: self.user_tokens,
                user_shares: self.user_shares,
                token_program: TOKEN,
            }
            .to_account_metas(None),
        );
        let u = self.user.insecure_clone();
        send(&mut self.svm, &[i], &[&u])
    }
    fn withdraw(&mut self, shares: u64) -> Result<Vec<String>, String> {
        let i = Instruction::new_with_bytes(
            vid(),
            &ix::Withdraw { shares }.data(),
            acc::Withdraw {
                user: self.user.pubkey(),
                vault: self.vault,
                idle: self.idle,
                share_mint: self.shares,
                user_tokens: self.user_tokens,
                user_shares: self.user_shares,
                token_program: TOKEN,
            }
            .to_account_metas(None),
        );
        let u = self.user.insecure_clone();
        send(&mut self.svm, &[i], &[&u])
    }
    fn allocate(&mut self, slug: &str, amount: u64) -> Result<Vec<String>, String> {
        let p = pid(slug);
        let pos = pos_pda(&self.vault, &p);
        let i = Instruction::new_with_bytes(
            vid(),
            &ix::Allocate {
                protocol_id: p,
                amount,
            }
            .data(),
            acc::Allocate {
                manager: self.admin.pubkey(),
                vault: self.vault,
                mint: self.mint,
                idle: self.idle,
                position: pos,
                position_tokens: pos_tokens(&pos),
                token_program: TOKEN,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        let a = self.admin.insecure_clone();
        send(&mut self.svm, &[i], &[&a])
    }
    fn exit_ix(&self, slug: &str, risk: Pubkey) -> Instruction {
        let pos = pos_pda(&self.vault, &pid(slug));
        Instruction::new_with_bytes(
            vid(),
            &ix::CheckAndExit {}.data(),
            acc::CheckAndExit {
                caller: self.user.pubkey(),
                vault: self.vault,
                idle: self.idle,
                position: pos,
                position_tokens: pos_tokens(&pos),
                risk,
                token_program: TOKEN,
            }
            .to_account_metas(None),
        )
    }
    fn check_and_exit(&mut self, slug: &str) -> Result<Vec<String>, String> {
        let i = self.exit_ix(slug, risk_pda(&pid(slug)));
        let u = self.user.insecure_clone();
        send(&mut self.svm, &[i], &[&u])
    }
}

#[test]
fn deposit_withdraw_math() {
    let mut e = setup(40);
    e.deposit(100_000).unwrap();
    assert_eq!(token_amount(&e.svm, &e.user_shares), 100_000);
    e.deposit(50_000).unwrap();
    assert_eq!(token_amount(&e.svm, &e.user_shares), 150_000);
    // simulate yield: 30k donated to idle → share price 1.2
    let admin = e.admin.insecure_clone();
    send(
        &mut e.svm,
        &[
            spl_token::instruction::mint_to(&TOKEN, &e.mint, &e.idle, &admin.pubkey(), &[], 30_000)
                .unwrap(),
        ],
        &[&admin],
    )
    .unwrap();
    e.deposit(12_000).unwrap(); // → 10_000 shares
    assert_eq!(token_amount(&e.svm, &e.user_shares), 160_000);
    let before = token_amount(&e.svm, &e.user_tokens);
    e.withdraw(10_000).unwrap();
    assert_eq!(token_amount(&e.svm, &e.user_tokens) - before, 12_000);
    assert!(e.deposit(0).is_err());
    assert!(e.withdraw(10_000_000).is_err());
}

#[test]
fn allocation_limits_withdraw_and_manager_only() {
    let mut e = setup(40);
    e.deposit(100_000).unwrap();
    e.allocate("proto", 80_000).unwrap();
    let v: Vault = read(&e.svm, &e.vault);
    assert_eq!(v.total_allocated, 80_000);
    assert!(e.withdraw(50_000).is_err(), "only 20k idle");
    e.withdraw(20_000).unwrap();
    // non-manager can't allocate
    let p = pid("proto");
    let pos = pos_pda(&e.vault, &p);
    let i = Instruction::new_with_bytes(
        vid(),
        &ix::Allocate {
            protocol_id: p,
            amount: 1,
        }
        .data(),
        acc::Allocate {
            manager: e.user.pubkey(),
            vault: e.vault,
            mint: e.mint,
            idle: e.idle,
            position: pos,
            position_tokens: pos_tokens(&pos),
            token_program: TOKEN,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let u = e.user.insecure_clone();
    assert!(send(&mut e.svm, &[i], &[&u]).is_err());
}

#[test]
fn check_and_exit_only_when_red_and_idempotent() {
    let mut e = setup(40);
    e.deposit(100_000).unwrap();
    e.allocate("proto", 70_000).unwrap();
    // green: score 85, no red flags (NO_TIMELOCK alone is not red)
    e.publish("proto", 85, 1 << 1, 10);
    assert!(e.check_and_exit("proto").is_err(), "not red");
    // red via NO_TIMELOCK_LOW_THRESHOLD
    e.publish("proto", 60, (1 << 1) | (1 << 2) | (1 << 10), 11);
    let logs = e.check_and_exit("proto").unwrap();
    assert!(
        logs.iter().any(|l| l.contains("Program data:")),
        "ShieldTriggered event emitted"
    );
    let pos: Position = read(&e.svm, &pos_pda(&e.vault, &pid("proto")));
    assert!(pos.shielded);
    assert_eq!(pos.allocated, 0);
    assert_eq!(token_amount(&e.svm, &e.idle), 100_000);
    let v: Vault = read(&e.svm, &e.vault);
    assert_eq!(v.total_allocated, 0);
    // idempotent
    e.check_and_exit("proto").unwrap();
    assert!(
        e.allocate("proto", 1).is_err(),
        "shielded positions can't be re-allocated"
    );
    // users can now fully withdraw
    e.withdraw(100_000).unwrap();
}

#[test]
fn exits_when_score_below_min() {
    let mut e = setup(50);
    e.deposit(10_000).unwrap();
    e.allocate("lowscore", 5_000).unwrap();
    e.publish("lowscore", 49, 0, 1);
    e.check_and_exit("lowscore").unwrap();
}

#[test]
fn rejects_wrong_owner_and_wrong_pda_risk_record() {
    let mut e = setup(40);
    e.deposit(10_000).unwrap();
    e.allocate("proto", 5_000).unwrap();
    e.allocate("other", 1_000).unwrap();
    e.publish("other", 0, 1, 1); // red record but for another protocol
                                 // Wrong PDA: pass "other"'s (red) record for "proto"'s position
    let i = e.exit_ix("proto", risk_pda(&pid("other")));
    let u = e.user.insecure_clone();
    assert!(send(&mut e.svm, &[i], &[&u]).is_err(), "wrong PDA");
    // Wrong owner: forge a byte-identical RiskRecord at the right address but owned by the system program
    let forged_addr = risk_pda(&pid("proto"));
    let mut acct = e.svm.get_account(&risk_pda(&pid("other"))).unwrap();
    acct.owner = system_program::ID;
    e.svm.set_account(forged_addr, acct).unwrap();
    assert!(e.check_and_exit("proto").is_err(), "wrong owner");
    let _ = AccountMeta::new_readonly(forged_addr, false);
}
