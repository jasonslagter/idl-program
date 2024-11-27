use anchor_lang::idl::ERASED_AUTHORITY;
use anchor_lang::prelude::*;

declare_id!("SMWfYpQEWcgX2CCPmTKXp5Sn8mdji8sATYBSmqsqYaV");

#[program]
pub mod upload_idl_anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("IDL account initialized: {:?}", ctx.program_id);
        ctx.accounts.idl.authority = *ctx.accounts.signer.key;
        Ok(())
    }

    pub fn write_idl(ctx: Context<WriteIdl>, idl_data: Vec<u8>) -> Result<()> {
        let prev_len: usize =
            ::std::convert::TryInto::<usize>::try_into(ctx.accounts.idl.data_len).unwrap();

        let new_len: usize = prev_len.checked_add(idl_data.len()).unwrap();

        ctx.accounts.idl.data_len = ctx
            .accounts
            .idl
            .data_len
            .checked_add(::std::convert::TryInto::<u32>::try_into(idl_data.len()).unwrap())
            .unwrap();

        let mut idl_bytes = ctx.accounts.idl.trailing_data_mut();
        let idl_expansion = &mut idl_bytes[prev_len..new_len];
        require_eq!(idl_expansion.len(), idl_data.len());
        idl_expansion.copy_from_slice(&idl_data[..]);
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
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [b"idl", signer.key.as_ref()],
        bump,
        payer = signer,
        space = 10240
    )]
    pub idl: Account<'info, IdlAccount>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WriteIdl<'info> {
    #[account(
        seeds = [b"idl", signer.key.as_ref()],
        bump, mut
    )]
    pub idl: Account<'info, IdlAccount>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Accounts for creating an idl buffer.
#[derive(Accounts)]
pub struct IdlCreateBuffer<'info> {
    #[account(zero)]
    pub buffer: Account<'info, IdlAccount>,
    #[account(constraint = authority.key != &ERASED_AUTHORITY)]
    pub authority: Signer<'info>,
}

#[account]
pub struct IdlAccount {
    authority: Pubkey,
    data_len: u32,
    // The rest is compressed idl bytes.
}
