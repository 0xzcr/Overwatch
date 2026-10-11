use {
    anchor_lang::{prelude::Pubkey, solana_program::{instruction::Instruction, system_program}, AccountDeserialize, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    overwatch_registry::{accounts as acc, instruction as ix, Config, RiskRecord},
    sha2::{Digest, Sha256},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn svm() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program(overwatch_registry::id(), include_bytes!("../../../target/deploy/overwatch_registry.so")).unwrap();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    (svm, payer)
}
fn send(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.meta.logs))
}
fn config_pda() -> Pubkey { Pubkey::find_program_address(&[b"config"], &overwatch_registry::id()).0 }
pub fn pid(slug: &str) -> [u8; 32] { Sha256::digest(slug.as_bytes()).into() }
fn risk_pda(p: &[u8; 32]) -> Pubkey { Pubkey::find_program_address(&[b"risk", p], &overwatch_registry::id()).0 }
fn i(data: Vec<u8>, metas: Vec<anchor_lang::prelude::AccountMeta>) -> Instruction { Instruction::new_with_bytes(overwatch_registry::id(), &data, metas) }

fn init(svm: &mut LiteSVM, payer: &Keypair, admin: Pubkey) {
    send(svm, &[i(ix::Initialize { admin }.data(), acc::Initialize { payer: payer.pubkey(), config: config_pda(), system_program: system_program::ID }.to_account_metas(None))], &[payer]).unwrap();
}
fn admin_ix(data: Vec<u8>, admin: Pubkey) -> Instruction { i(data, acc::AdminOnly { admin, config: config_pda() }.to_account_metas(None)) }
fn upsert(publisher: Pubkey, p: [u8; 32], score: u8, flags: u64, slot: u64) -> Instruction {
    i(ix::UpsertRisk { protocol_id: p, score, grade: 0, flags, last_event_slot: slot }.data(),
      acc::UpsertRisk { publisher, config: config_pda(), risk: risk_pda(&p), system_program: system_program::ID }.to_account_metas(None))
}
fn read<T: AccountDeserialize>(svm: &LiteSVM, k: &Pubkey) -> T { T::try_deserialize(&mut &svm.get_account(k).unwrap().data[..]).unwrap() }

#[test]
fn pda_derivation_and_init() {
    let (mut svm, payer) = svm();
    init(&mut svm, &payer, payer.pubkey());
    let c: Config = read(&svm, &config_pda());
    assert_eq!(c.admin, payer.pubkey());
    assert_eq!(c.publisher_count, 0);
    // double init fails
    assert!(send(&mut svm, &[i(ix::Initialize { admin: payer.pubkey() }.data(), acc::Initialize { payer: payer.pubkey(), config: config_pda(), system_program: system_program::ID }.to_account_metas(None))], &[&payer]).is_err());
    // sha256(slug), same as packages/core protocolId(); `echo -n drift | shasum -a 256`
    assert_eq!(hex(&pid("drift")), DRIFT_SHA);
}
const DRIFT_SHA: &str = "0b7a461fefbb68e518e51884369a4b88baffdb40b7e578921f3f88649ebc6494";
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{:02x}", x)).collect() }

#[test]
fn auth_checks() {
    let (mut svm, admin) = svm();
    init(&mut svm, &admin, admin.pubkey());
    let rando = Keypair::new();
    svm.airdrop(&rando.pubkey(), 1_000_000_000).unwrap();
    let publisher = Keypair::new();
    svm.airdrop(&publisher.pubkey(), 1_000_000_000).unwrap();
    // non-admin cannot add publisher / pause
    assert!(send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: rando.pubkey() }.data(), rando.pubkey())], &[&rando]).is_err());
    assert!(send(&mut svm, &[admin_ix(ix::SetPaused { paused: true }.data(), rando.pubkey())], &[&rando]).is_err());
    // non-publisher cannot upsert
    assert!(send(&mut svm, &[upsert(publisher.pubkey(), pid("x"), 50, 0, 1)], &[&publisher]).is_err());
    send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: publisher.pubkey() }.data(), admin.pubkey())], &[&admin]).unwrap();
    assert!(send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: publisher.pubkey() }.data(), admin.pubkey())], &[&admin]).is_err(), "duplicate");
    send(&mut svm, &[upsert(publisher.pubkey(), pid("x"), 50, 1 << 4, 1)], &[&publisher]).unwrap();
    let r: RiskRecord = read(&svm, &risk_pda(&pid("x")));
    assert_eq!((r.score, r.flags, r.version, r.publisher), (50, 1 << 4, 1, publisher.pubkey()));
    assert!(r.is_red());
    // invalid score
    assert!(send(&mut svm, &[upsert(publisher.pubkey(), pid("x"), 101, 0, 2)], &[&publisher]).is_err());
    // removal revokes
    send(&mut svm, &[admin_ix(ix::RemovePublisher { publisher: publisher.pubkey() }.data(), admin.pubkey())], &[&admin]).unwrap();
    assert!(send(&mut svm, &[upsert(publisher.pubkey(), pid("x"), 60, 0, 3)], &[&publisher]).is_err());
    assert!(send(&mut svm, &[admin_ix(ix::RemovePublisher { publisher: publisher.pubkey() }.data(), admin.pubkey())], &[&admin]).is_err());
    // max 5 publishers
    for _ in 0..5 { send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: Pubkey::new_unique() }.data(), admin.pubkey())], &[&admin]).unwrap(); }
    assert!(send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: Pubkey::new_unique() }.data(), admin.pubkey())], &[&admin]).is_err());
}

#[test]
fn stale_rejected_and_paused() {
    let (mut svm, admin) = svm();
    init(&mut svm, &admin, admin.pubkey());
    send(&mut svm, &[admin_ix(ix::AddPublisher { publisher: admin.pubkey() }.data(), admin.pubkey())], &[&admin]).unwrap();
    send(&mut svm, &[upsert(admin.pubkey(), pid("p"), 90, 0, 100)], &[&admin]).unwrap();
    assert!(send(&mut svm, &[upsert(admin.pubkey(), pid("p"), 10, 0, 99)], &[&admin]).is_err(), "stale");
    send(&mut svm, &[upsert(admin.pubkey(), pid("p"), 80, 0, 100)], &[&admin]).unwrap(); // same slot ok
    let r: RiskRecord = read(&svm, &risk_pda(&pid("p")));
    assert_eq!((r.score, r.version), (80, 2));
    send(&mut svm, &[admin_ix(ix::SetPaused { paused: true }.data(), admin.pubkey())], &[&admin]).unwrap();
    assert!(send(&mut svm, &[upsert(admin.pubkey(), pid("p"), 70, 0, 200)], &[&admin]).is_err(), "paused");
    send(&mut svm, &[admin_ix(ix::SetPaused { paused: false }.data(), admin.pubkey())], &[&admin]).unwrap();
    send(&mut svm, &[upsert(admin.pubkey(), pid("p"), 70, 0, 200)], &[&admin]).unwrap();
    // admin handover
    let new_admin = Keypair::new();
    svm.airdrop(&new_admin.pubkey(), 1_000_000_000).unwrap();
    send(&mut svm, &[admin_ix(ix::SetAdmin { new_admin: new_admin.pubkey() }.data(), admin.pubkey())], &[&admin]).unwrap();
    assert!(send(&mut svm, &[admin_ix(ix::SetPaused { paused: true }.data(), admin.pubkey())], &[&admin]).is_err());
}
