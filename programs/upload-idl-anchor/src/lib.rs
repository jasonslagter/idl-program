use anchor_lang::idl::ERASED_AUTHORITY;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

declare_id!("idLB41CuMPpWZmQGGxpsxbyGDWWzono4JnFLJxQakrE");

#[program]
pub mod upload_idl_anchor {

    use super::*;

    #[error_code]
    pub enum MyError {
        #[msg("Only the program upgrade authority can initialize the IDL account")]
        WrongAuthority,        
        #[msg("The program account is not executable")]
        NotExecutable,
        #[msg("The program account is not a program. Not owned by the BPF loader")]
        NotAProgram,
        #[msg("The program account should not be a program data account")]
        ShouldBeProgramAccount,
    }

    pub fn initialize(ctx: Context<Initialize>, _seed: String) -> Result<()> {
        msg!("IDL account initialized: {:?}", ctx.program_id);
        
        msg!("Signer {:?}!", ctx.accounts.signer.key);              
        msg!("Authority {:?}!", ctx.accounts.program_data.upgrade_authority_address);              

        if ctx.accounts.program_id.owner.key() != bpf_loader_upgradeable::ID {
            return Err(MyError::NotAProgram.into());
        }

        if !ctx.accounts.program_id.executable {
            return Err(MyError::NotExecutable.into());
        }
    
        // Borrow the program's account data
        let mut program_borrowed_data: &[u8] = &ctx.accounts.program_id.try_borrow_data()?;

        // Deserialize the UpgradeableLoaderState from the program account data
        let upgradable_loader_state =
            UpgradeableLoaderState::try_deserialize_unchecked(&mut program_borrowed_data)?;

        match upgradable_loader_state {
            UpgradeableLoaderState::Uninitialized
            | UpgradeableLoaderState::Buffer {
                authority_address: _,
            }
            | UpgradeableLoaderState::ProgramData {
                slot: _,
                upgrade_authority_address: _,
            } => {
                return err!(MyError::ShouldBeProgramAccount);
            }
            UpgradeableLoaderState::Program {
                programdata_address: program_data_address,
            } => {
                // Print out the program data address
                msg!("Program Data Address: {:?}", program_data_address);

                // Ensure the program data address matches the expected value
                if program_data_address != ctx.accounts.program_data.key() {
                    return err!(MyError::WrongAuthority);
                }
            }
        }

        // When all is good create PDA and save authority for later upgrades.
        ctx.accounts.idl.authority = *ctx.accounts.signer.key;
        Ok(())
    }

    pub fn write_buffer(ctx: Context<WriteBuffer>, idl_data: Vec<u8>) -> Result<()> {
        let prev_len: usize =
            ::std::convert::TryInto::<usize>::try_into(ctx.accounts.buffer.data_len).unwrap();

        let new_len: usize = prev_len.checked_add(idl_data.len()).unwrap();

        ctx.accounts.buffer.data_len = ctx
            .accounts
            .buffer
            .data_len
            .checked_add(::std::convert::TryInto::<u32>::try_into(idl_data.len()).unwrap())
            .unwrap();

        let mut idl_bytes = ctx.accounts.buffer.trailing_data_mut();
        let idl_expansion = &mut idl_bytes[prev_len..new_len];
        require_eq!(idl_expansion.len(), idl_data.len());
        idl_expansion.copy_from_slice(&idl_data[..]);
        Ok(())
    }

    pub fn create_buffer(ctx: Context<IdlCreateBuffer>) -> Result<()> {
        ctx.accounts.buffer.authority = *ctx.accounts.authority.key;
        Ok(())
    }

    pub fn close_buffer(_ctx: Context<IdlCloseBuffer>) -> Result<()> {
        Ok(())
    }

    pub fn resize(_ctx: Context<Resize>, _len: u16, _seed: String) -> Result<()> {
        Ok(())
    }

    pub fn set_buffer(ctx: Context<IdlSetBuffer>, _seed: String) -> Result<()> {
        ctx.accounts.idl.data_len = ctx.accounts.buffer.data_len;

        use IdlUploadTrailingData;
        let buffer_len = ::std::convert::TryInto::<usize>::try_into(ctx.accounts.buffer.data_len).unwrap();
        let mut target = ctx.accounts.idl.trailing_data_mut();
        let source = &ctx.accounts.buffer.trailing_data()[..buffer_len];
        require_gte!(target.len(), buffer_len);
        target[..buffer_len].copy_from_slice(source);
        
        Ok(())
    }

    use std::cell::{Ref, RefMut};

    pub trait IdlUploadTrailingData<'info> {
        fn trailing_data(self) -> Ref<'info, [u8]>;
        fn trailing_data_mut(self) -> RefMut<'info, [u8]>;
    }

    impl<'a, 'info: 'a> IdlUploadTrailingData<'a> for &'a Account<'info, IdlAccount> {
        fn trailing_data(self) -> Ref<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            Ref::map(info.try_borrow_data().unwrap(), |d| &d[44..])
        }
        fn trailing_data_mut(self) -> RefMut<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            RefMut::map(info.try_borrow_mut_data().unwrap(), |d| &mut d[44..])
        }
    }
}

#[derive(Accounts)]
#[instruction(seed: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [seed.as_ref(), program_id.key.as_ref()],
        bump,
        payer = signer,
        space = 8 + 32 + 4,
    )]
    pub idl: Account<'info, IdlAccount>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the program id of the program you want to upload the IDL for. Checks are done in code.
    pub program_id: AccountInfo<'info>,
    // Make sure that the signer is actually the upgrade authority of the program.
    #[account(constraint = program_data.upgrade_authority_address == Some(signer.key()))]
    pub program_data: Account<'info, ProgramData>,
}

#[derive(Accounts)]
// Seed can be dynamic. For IDL use "idl" as seed.
#[instruction(len: u16, seed: String)]
pub struct Resize<'info> {
    #[account(
        mut,
        seeds = [seed.as_ref(), program_id.key.as_ref()],
        bump,
        realloc = len as usize, 
        realloc::zero = true, 
        realloc::payer = signer,
        constraint = idl.authority == signer.key()
    )]
    pub idl: Account<'info, IdlAccount>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the program id of the program you want to upload the IDL for.
    pub program_id: AccountInfo<'info>,
}

// Accounts for creating an idl buffer.
#[derive(Accounts)]
pub struct IdlCreateBuffer<'info> {
    #[account(zero)]
    pub buffer: Account<'info, IdlAccount>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

// Close buffer to claim back SOL
#[derive(Accounts)]
pub struct IdlCloseBuffer<'info> {
    #[account(mut, close = authority, constraint = buffer.authority == authority.key())]
    pub buffer: Account<'info, IdlAccount>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WriteBuffer<'info> {
    #[account(mut, constraint = buffer.authority == signer.key())]
    pub buffer: Account<'info, IdlAccount>,
    #[account(mut, constraint = signer.key != &ERASED_AUTHORITY)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Accounts for upgrading the canonical IdlAccount with the buffer.
#[derive(Accounts)]
#[instruction(seed: String)]
pub struct IdlSetBuffer<'info> {
    // The buffer with the new idl data.
    #[account(mut, constraint = buffer.authority == idl.authority)]
    pub buffer: Account<'info, IdlAccount>,
    // The idl account to be updated with the buffer's data.
    #[account(mut, 
        seeds = [seed.as_ref(), program_id.key.as_ref()],
        bump,
        has_one = authority,
        constraint = idl.authority == authority.key()
    )]
    pub idl: Account<'info, IdlAccount>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
    /// CHECK: This is the program id of the program you want to upload the IDL for.
    pub program_id: AccountInfo<'info>,
}

#[account]
pub struct IdlAccount {
    authority: Pubkey,
    data_len: u32,
    // The rest is compressed idl bytes.
}
