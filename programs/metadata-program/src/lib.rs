use anchor_lang::idl::ERASED_AUTHORITY;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

declare_id!("pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA");

#[program]
pub mod metadata_program {

    use anchor_lang::solana_program::{bpf_loader, bpf_loader_deprecated};

    use super::*;

    #[error_code]
    pub enum MyError {
        #[msg("Only the program upgrade authority can initialize the associated program metadata account")]
        WrongAuthority,        
        #[msg("The program account is not executable")]
        NotExecutable,
        #[msg("The program account is not a program. Not owned by the BPF loader")]
        NotAProgram,
        #[msg("The program account should not be a program data account")]
        ShouldBeProgramAccount,
        #[msg("Data type is too long")]
        DataTypeTooLong,
        #[msg("Invalid authority")]
        InvalidAuthority,
        #[msg("Wrong program ID")]
        WrongProgramId
    }

    pub fn initialize(ctx: Context<Initialize>, data_type: String, _seed: String) -> Result<()> {      
        msg!("Signer {:?}!", ctx.accounts.signer.key);              
        msg!("Authority {:?}!", ctx.accounts.program_data.upgrade_authority_address);              

        if ctx.accounts.program_id.owner.key() != bpf_loader_upgradeable::ID 
        && ctx.accounts.program_id.owner.key() != bpf_loader::ID 
        && ctx.accounts.program_id.owner.key() != bpf_loader_deprecated::ID {
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
        let account = &mut ctx.accounts.pda;
        account.authority = *ctx.accounts.signer.key;
        account.program_id = *ctx.accounts.program_id.key;
        account.set_data_type(&data_type)?;
        
        Ok(())
    }

    pub fn initialize_with_signer_seed(ctx: Context<InitializeWithSignerSeed>, data_type: String, _seed: String) -> Result<()> {      
        msg!("Signer {:?}!", ctx.accounts.signer.key);              
        msg!("Authority {:?}!", ctx.accounts.program_data.upgrade_authority_address);              

        if ctx.accounts.program_id.owner.key() != bpf_loader_upgradeable::ID 
        && ctx.accounts.program_id.owner.key() != bpf_loader::ID 
        && ctx.accounts.program_id.owner.key() != bpf_loader_deprecated::ID {
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
        let account = &mut ctx.accounts.pda;
        account.authority = *ctx.accounts.signer.key;
        account.program_id = *ctx.accounts.program_id.key;
        account.set_data_type(&data_type)?;
        Ok(())
    }

    pub fn write_buffer(ctx: Context<WriteBuffer>, data: Vec<u8>) -> Result<()> {
        let prev_len: usize =
            ::std::convert::TryInto::<usize>::try_into(ctx.accounts.buffer.data_len).unwrap();

        let new_len: usize = prev_len.checked_add(data.len()).unwrap();

        ctx.accounts.buffer.data_len = ctx
            .accounts
            .buffer
            .data_len
            .checked_add(::std::convert::TryInto::<u32>::try_into(data.len()).unwrap())
            .unwrap();

        let mut trailing_bytes = ctx.accounts.buffer.trailing_data_mut();
        let data_expansion = &mut trailing_bytes[prev_len..new_len];
        require_eq!(data_expansion.len(), data.len());
        data_expansion.copy_from_slice(&data[..]);
        Ok(())
    }

    pub fn create_buffer(ctx: Context<CreateBuffer>, data_type: String) -> Result<()> {
        let buffer = &mut ctx.accounts.buffer;
        buffer.authority = *ctx.accounts.authority.key;
        buffer.set_data_type(&data_type)?;
        Ok(())
    }

    pub fn close_metadata_account_2(_ctx: Context<CloseMetadataAccount2>) -> Result<()> {
        Ok(())
    }

    pub fn close_metadata_account_1(_ctx: Context<CloseMetadataAccount1>) -> Result<()> {
        Ok(())
    }

    pub fn close_buffer(_ctx: Context<CloseBuffer>) -> Result<()> {
        Ok(())
    }

    pub fn resize(_ctx: Context<Resize>, _len: u16) -> Result<()> {
        Ok(())
    }

    pub fn set_authority(ctx: Context<MetadataAccounts>, new_authority: Pubkey) -> Result<()> {
        ctx.accounts.pda.authority = new_authority;
        Ok(())
    }

    pub fn set_buffer(ctx: Context<SetBuffer>) -> Result<()> {
        // First verify that the PDA belongs to the provided program ID
        if ctx.accounts.pda.program_id != ctx.accounts.program_id.key() {
            return err!(MyError::WrongProgramId);
        }

        // First check if it's the program's authority by checking program data
        let is_program_authority = {
            if ctx.accounts.program_id.owner.key() != bpf_loader_upgradeable::ID 
                && ctx.accounts.program_id.owner.key() != bpf_loader::ID 
                && ctx.accounts.program_id.owner.key() != bpf_loader_deprecated::ID {
                return err!(MyError::NotAProgram);
            }
            
            if !ctx.accounts.program_id.executable {
                return err!(MyError::NotExecutable);
            }

            // Borrow the program's account data
            let mut program_borrowed_data: &[u8] = &ctx.accounts.program_id.try_borrow_data()?;
            let upgradable_loader_state = UpgradeableLoaderState::try_deserialize_unchecked(&mut program_borrowed_data)?;

            match upgradable_loader_state {
                UpgradeableLoaderState::Program { programdata_address } => {
                    // Ensure the program data address matches
                    if programdata_address != ctx.accounts.program_data.key() {
                        return err!(MyError::WrongAuthority);
                    }
                    ctx.accounts.program_data.upgrade_authority_address == Some(ctx.accounts.authority.key())
                },
                _ => return err!(MyError::ShouldBeProgramAccount)
            }
        };

        // If not program authority, then must be PDA authority
        if !is_program_authority && ctx.accounts.pda.authority != ctx.accounts.authority.key() {
            return err!(MyError::InvalidAuthority);
        }

        // If it's the program authority, set the PDA authority to match
        if is_program_authority {
            ctx.accounts.pda.authority = ctx.accounts.authority.key();
        }

        // Perform the buffer set operation
        ctx.accounts.pda.data_len = ctx.accounts.buffer.data_len;
        ctx.accounts.pda.set_data_type(&ctx.accounts.buffer.get_data_type())?;

        use MetadataUploadTrailingData;
        let buffer_len = ::std::convert::TryInto::<usize>::try_into(ctx.accounts.buffer.data_len).unwrap();
        let mut target = ctx.accounts.pda.trailing_data_mut();
        let source = &ctx.accounts.buffer.trailing_data()[..buffer_len];
        require_gte!(target.len(), buffer_len);
        target[..buffer_len].copy_from_slice(source);
        Ok(())
    }

    use std::cell::{Ref, RefMut};

    pub trait MetadataUploadTrailingData<'info> {
        fn trailing_data(self) -> Ref<'info, [u8]>;
        fn trailing_data_mut(self) -> RefMut<'info, [u8]>;
    }

    impl<'a, 'info: 'a> MetadataUploadTrailingData<'a> for &'a Account<'info, MetadataAccount2> {
        fn trailing_data(self) -> Ref<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            Ref::map(info.try_borrow_data().unwrap(), |d| &d[(METADATA_ACCOUNT_SIZE as usize )..])
        }
        fn trailing_data_mut(self) -> RefMut<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            RefMut::map(info.try_borrow_mut_data().unwrap(), |d| &mut d[(METADATA_ACCOUNT_SIZE as usize )..])
        }
    }

    pub trait MetadataBufferUploadTrailingData<'info> {
        fn trailing_data(self) -> Ref<'info, [u8]>;
        fn trailing_data_mut(self) -> RefMut<'info, [u8]>;
    }

    impl<'a, 'info: 'a> MetadataBufferUploadTrailingData<'a> for &'a Account<'info, MetadataBuffer> {
        fn trailing_data(self) -> Ref<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            Ref::map(info.try_borrow_data().unwrap(), |d| &d[(METADATA_ACCOUNT_SIZE as usize )..])
        }
        fn trailing_data_mut(self) -> RefMut<'a, [u8]> {
            let info: &AccountInfo<'info> = self.as_ref();
            RefMut::map(info.try_borrow_mut_data().unwrap(), |d| &mut d[(METADATA_ACCOUNT_SIZE as usize )..])
        }
    }
}

#[derive(Accounts)]
#[instruction(data_type: String, seed: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [program_id.key.as_ref(), seed.as_ref()],
        bump,
        payer = signer,
        space = METADATA_ACCOUNT_SIZE as usize,
    )]
    pub pda: Account<'info, MetadataAccount2>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the program id of the program you want to upload the metadata for. Checks are done in code.
    pub program_id: AccountInfo<'info>,
    // Make sure that the signer is actually the upgrade authority of the program.
    #[account(constraint = program_data.upgrade_authority_address == Some(signer.key()))]
    pub program_data: Account<'info, ProgramData>,
}

#[derive(Accounts)]
#[instruction(data_type: String, seed: String)]
pub struct InitializeWithSignerSeed<'info> {
    #[account(
        init,
        seeds = [program_id.key.as_ref(), signer.key.as_ref(), seed.as_ref()],
        bump,
        payer = signer,
        space = METADATA_ACCOUNT_SIZE as usize,
    )]
    pub pda: Account<'info, MetadataAccount2>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the program id of the program you want to upload the metadata for. Checks are done in code.
    pub program_id: AccountInfo<'info>,
    // When we add signer seed we do NOT check if the signer is the program authority
    pub program_data: Account<'info, ProgramData>,
}

#[derive(Accounts)]
pub struct MetadataAccounts<'info> {
    #[account(mut, has_one = authority)]
    pub pda: Account<'info, MetadataAccount2>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
// Seed can be dynamic. For IDL use "idl" as seed. For metadata use "metadata" as seed.
#[instruction(len: u16)]
pub struct Resize<'info> {
    #[account(
        mut,
        realloc = len as usize, 
        realloc::zero = true, 
        realloc::payer = signer,
        constraint = pda.authority == signer.key()
    )]
    pub pda: Account<'info, MetadataAccount2>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the program id of the program you want to upload the metadata for.
    pub program_id: AccountInfo<'info>,
}

// Accounts for creating an metadata buffer.
#[derive(Accounts)]
#[instruction(data_type: String)]
pub struct CreateBuffer<'info> {
    #[account(zero)]
    pub buffer: Account<'info, MetadataBuffer>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

// Close metadata account to claim back SOL. Only the authority can close the account.
#[derive(Accounts)]
pub struct CloseMetadataAccount2<'info> {
    #[account(mut, close = authority, constraint = metadata_account.authority == authority.key())]
    pub metadata_account: Account<'info, MetadataAccount2>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

// Close metadata account to claim back SOL. Only the authority can close the account.
#[derive(Accounts)]
pub struct CloseMetadataAccount1<'info> {
    #[account(mut, close = authority, constraint = metadata_account.authority == authority.key())]
    pub metadata_account: Account<'info, MetadataAccount>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}


// Close buffer to claim back SOL
#[derive(Accounts)]
pub struct CloseBuffer<'info> {
    #[account(mut, close = authority, constraint = buffer.authority == authority.key())]
    pub buffer: Account<'info, MetadataBuffer>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WriteBuffer<'info> {
    #[account(mut, constraint = buffer.authority == signer.key())]
    pub buffer: Account<'info, MetadataBuffer>,
    #[account(mut, constraint = signer.key != &ERASED_AUTHORITY)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Accounts for upgrading the canonical MetadataAccount with the buffer.
#[derive(Accounts)]
pub struct SetBuffer<'info> {
    // The buffer with the new metadata. The authority of this can be anyone so that 
    // anyone can write it. But only the program authority or the PDA authority can set the buffer.
    #[account(mut)]
    pub buffer: Account<'info, MetadataBuffer>,
    // The pda account to be updated with the buffer's data. There are two checks of the PDA:
    // 1. The PDA that is the authority of the program. This is the program authority.
    // 2. The PDA that is the authority of the program data. This is the PDA authority.
    // So the program authority can always overwrite the PDA authority.
    #[account(mut)]
    pub pda: Account<'info, MetadataAccount2>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
    /// CHECK: This is the program id of the program you want to upload the IDL for.
    pub program_id: AccountInfo<'info>,
    /// The program data account containing the upgrade authority
    pub program_data: Account<'info, ProgramData>,
}

#[account]
pub struct MetadataAccount2 {
    pub authority: Pubkey,
    pub data_type: [u8; 16], // 16 bytes to be flexible to what people want to use it for. 
    pub program_id: Pubkey,
    pub data_len: u32,
    // trailing data...
}

#[account]
pub struct MetadataBuffer {
    pub authority: Pubkey,
    pub data_type: [u8; 16], // 16 bytes to be flexible to what people want to use it for. 
    pub program_id: Pubkey,
    pub data_len: u32,
    // trailing data...
}

#[account]
pub struct MetadataAccount {
    pub authority: Pubkey,
    pub data_type: [u8; 16], // 16 bytes to be flexible to what people want to use it for. 
    pub data_len: u32,
    // trailing data...
}

// Common data type constants
#[constant]
pub const DATA_TYPE_IDL_JSON: &str = "idl.json";
#[constant]
pub const DATA_TYPE_IDL_URL: &str = "idl.url";
#[constant]
pub const DATA_TYPE_META_JSON: &str = "meta.json";
#[constant]
pub const DATA_TYPE_META_URL: &str = "meta.url";
// But users can also use their own types:
// "game.stats"
// "dao.config.v1"
// "nft.attributes"
// "social.profile"
// "audited.by.json"

// Size constants for composability
pub const PUBKEY_LENGTH: u64 = 32;
pub const PROGRAM_ID_LENGTH: u64 = 32;
pub const U32_LENGTH: u64 = 4;

#[constant]
pub const DATA_TYPE_LENGTH: u64 = 16;

#[constant]
pub const METADATA_ACCOUNT_SIZE: u64 = 
    PUBKEY_LENGTH +                 // authority
    PROGRAM_ID_LENGTH +             // program_id
    U32_LENGTH +                    // data_len
    DATA_TYPE_LENGTH + 8;           // data_type + discriminator

impl MetadataAccount2 {
    pub fn set_data_type(&mut self, data_type: &str) -> Result<()> {
        require!(data_type.len() <= DATA_TYPE_LENGTH as usize, MyError::DataTypeTooLong);
        self.data_type.fill(0);  // Clear existing data
        self.data_type[..data_type.len()].copy_from_slice(data_type.as_bytes());
        Ok(())
    }

    pub fn get_data_type(&self) -> String {
        let len = self.data_type.iter().position(|&x| x == 0).unwrap_or(DATA_TYPE_LENGTH as usize);
        String::from_utf8_lossy(&self.data_type[..len]).to_string()
    }
}


impl MetadataBuffer {
    pub fn set_data_type(&mut self, data_type: &str) -> Result<()> {
        require!(data_type.len() <= DATA_TYPE_LENGTH as usize, MyError::DataTypeTooLong);
        self.data_type.fill(0);  // Clear existing data
        self.data_type[..data_type.len()].copy_from_slice(data_type.as_bytes());
        Ok(())
    }

    pub fn get_data_type(&self) -> String {
        let len = self.data_type.iter().position(|&x| x == 0).unwrap_or(DATA_TYPE_LENGTH as usize);
        String::from_utf8_lossy(&self.data_type[..len]).to_string()
    }
}
