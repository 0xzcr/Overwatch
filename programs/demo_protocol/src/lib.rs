//! DEMO protocol for the Overwatch devnet demo. It does nothing except log; what matters is who can upgrade it.
use solana_account_info::AccountInfo;
use solana_msg::msg;
use solana_program_error::ProgramResult;
use solana_pubkey::Pubkey;

solana_program_entrypoint::entrypoint!(process);

pub fn process(_program_id: &Pubkey, _accounts: &[AccountInfo], _data: &[u8]) -> ProgramResult {
    msg!("overwatch demo protocol: hello from a program watched by Overwatch");
    Ok(())
}
