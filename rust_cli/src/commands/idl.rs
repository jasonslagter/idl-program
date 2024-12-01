use anyhow::{Result, anyhow};
use flate2::write::GzEncoder;
use flate2::Compression;
use solana_client::rpc_config::RpcSendTransactionConfig;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    transaction::Transaction,
    signer::Signer,
    compute_budget::ComputeBudgetInstruction,
};
use std::io::Write;
use std::{str::FromStr, fs};
use crate::codama_sdk::instructions::{Resize, ResizeInstructionArgs};
use crate::config::get_user_config;
use crate::codama_sdk::{
    instructions::{
        initialize::{Initialize, InitializeInstructionArgs},
        create_buffer::{CreateBuffer, CreateBufferBuilder},
        write_buffer::{WriteBuffer, WriteBufferInstructionArgs},
        set_buffer::{SetBuffer, SetBufferInstructionArgs},
        close_buffer::{CloseBuffer},
    },
    programs::UPLOAD_IDL_ANCHOR_ID,
};

const IDL_SEED: &str = "idl";
const METADATA_OFFSET: usize = 44;
const CHUNK_SIZE: u16 = 900;
const MAX_RESIZE_STEP: u16 = 10240;



pub fn initialize_idl(
    program_id: &str,
    signer: &Keypair,
    priority_fees_per_cu: u64,
) -> Result<()> {

    let (_, rpc_client) = get_user_config()?;
    
    // Parse program ID
    let program_pubkey = Pubkey::from_str(program_id)
        .map_err(|e| anyhow!("Invalid program ID: {}", e))?;

    // Derive PDA for IDL account
    let (idl_address, _) = Pubkey::find_program_address(
        &[IDL_SEED.as_bytes(), program_pubkey.as_ref()],
        &UPLOAD_IDL_ANCHOR_ID
    );

    // Get program data address
    let (program_data_address, _) = Pubkey::find_program_address(
        &[program_pubkey.as_ref()],
        &solana_sdk::bpf_loader_upgradeable::ID,
    );

    // Create initialize instruction using the generated code
    let accounts = Initialize {
        idl: idl_address,
        signer: signer.pubkey(),
        system_program: solana_sdk::system_program::ID,
        program_id: program_pubkey,
        program_data: program_data_address,
    };

    let args = InitializeInstructionArgs {
        seed: IDL_SEED.to_string(),
    };

    let ix = accounts.instruction(args);

    // Create and send transaction
    let recent_blockhash = rpc_client
        .get_latest_blockhash()
        .map_err(|e| anyhow!("Failed to get recent blockhash: {}", e))?;


    //TODO: find more elegant solution to set appropriate compute unit limit
    let transaction_to_simulate = Transaction::new_signed_with_payer(
        &[ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu), ComputeBudgetInstruction::set_compute_unit_limit(200000) ,ix.clone()],
        Some(&signer.pubkey()),
        &[signer],
        recent_blockhash,
    );

    let simulation = rpc_client.simulate_transaction(&transaction_to_simulate)
    .map_err(|e| anyhow!("Failed to simulate transaction: {}", e))?;

    let units_consumed: u32 = simulation.value.units_consumed.unwrap_or(0) as u32;

    println!("Units consumed: {}", units_consumed);

    let transaction = Transaction::new_signed_with_payer(
        &[ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu), ComputeBudgetInstruction::set_compute_unit_limit(units_consumed + 200) ,ix],
        Some(&signer.pubkey()),
        &[&signer],
        recent_blockhash,
    );

    // let mut config = RpcSendTransactionConfig::default();
    // config.skip_preflight = true;

    let signature = rpc_client
        .send_and_confirm_transaction_with_spinner_and_commitment(&transaction, CommitmentConfig::confirmed())
        .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;

    println!("IDL initialized successfully!");
    println!("Signature: {}", signature);
    println!("IDL Account: {}", idl_address);
    
    Ok(())
}

pub fn upload_idl_by_json_path(
    idl_path: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
) -> Result<()> {
    // Get signer and RPC client
    let (signer, rpc_client) = if let Some(path) = keypair_path {
        let keypair = solana_sdk::signature::read_keypair_file(path)
            .map_err(|e| anyhow!("Failed to read keypair file: {}", e))?;
        let rpc_client = get_user_config()
            .map(|(_, client)| client)
            .map_err(|e| anyhow!("Failed to get RPC client: {}", e))?;
        (keypair, rpc_client)
    } else {
        get_user_config()
            .map_err(|e| anyhow!("Failed to get user config: {}", e))?
    };

    println!("Signer: {}", signer.pubkey());

    // Read and validate IDL file
    let idl_data = fs::read(idl_path)
        .map_err(|e| anyhow!("Failed to read IDL file: {}", e))?;

    // Parse program ID
    let program_pubkey = Pubkey::from_str(program_id)
        .map_err(|e| anyhow!("Invalid program ID: {}", e))?;

    // Get IDL account address
    let (idl_address, _) = Pubkey::find_program_address(
        &[IDL_SEED.as_bytes(), program_pubkey.as_ref()],
        &UPLOAD_IDL_ANCHOR_ID,
    );

    // Initialize IDL account if it doesn't exist
    let idl_account = rpc_client.get_account(&idl_address);
    if idl_account.is_err() {
        println!("IDL account doesn't exist, initializing...");
        initialize_idl( program_id, &signer, priority_fees_per_cu)?;
    }

    // Create buffer
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&idl_data)?;
    let compressed_data = encoder.finish()?;
    let data_len = compressed_data.len() + METADATA_OFFSET;

    let buffer_keypair = Keypair::new();
    
    // Calculate rent for the buffer account
    let rent = rpc_client.get_minimum_balance_for_rent_exemption(data_len)
        .map_err(|e| anyhow!("Failed to get rent: {}", e))?;

    // Create account instruction
    let create_account_ix = solana_sdk::system_instruction::create_account(
        &signer.pubkey(),
        &buffer_keypair.pubkey(),
        rent,
        data_len as u64,
        &UPLOAD_IDL_ANCHOR_ID,
    );

    // Create buffer instruction
    let create_buffer = CreateBufferBuilder::new()
        .buffer(buffer_keypair.pubkey())
        .authority(signer.pubkey())
        .instruction();
    let recent_blockhash = rpc_client
        .get_latest_blockhash()
        .map_err(|e| anyhow!("Failed to get recent blockhash: {}", e))?;

    let transaction = Transaction::new_signed_with_payer(
            &[ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu), ComputeBudgetInstruction::set_compute_unit_limit(5000),create_account_ix, create_buffer],
            Some(&signer.pubkey()),
            &[&signer, &buffer_keypair],
            recent_blockhash,
        );

    let signature = rpc_client
        .send_and_confirm_transaction_with_spinner_and_commitment(&transaction, CommitmentConfig::confirmed())
        .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;
    println!("Buffer account created successfully!");
    println!("Signature: {}", signature);
    println!("Buffer Account: {}", buffer_keypair.pubkey());
    // // Write buffer
    let mut offset = 0;
    while offset < compressed_data.len() {
        let chunk_end = std::cmp::min(offset + CHUNK_SIZE as usize, compressed_data.len());
        let chunk = &compressed_data[offset..chunk_end];

        let write_buffer = WriteBuffer {
            buffer: buffer_keypair.pubkey(),
            signer: signer.pubkey(),
            system_program: solana_sdk::system_program::ID,
        };
        
        let write_args = WriteBufferInstructionArgs {
            idl_data: chunk.to_vec(),
        };

        let write_ix = write_buffer.instruction(write_args);
        
        let recent_blockhash = rpc_client
            .get_latest_blockhash()
            .map_err(|e| anyhow!("Failed to get write buffer blockhash: {}", e))?;

        let write_transaction = Transaction::new_signed_with_payer(
            &[
                ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu),
                ComputeBudgetInstruction::set_compute_unit_limit(3000),
                write_ix
            ],
            Some(&signer.pubkey()),
            &[&signer],
            recent_blockhash,
        );

        let write_signature = rpc_client
            .send_and_confirm_transaction_with_spinner_and_commitment(
                &write_transaction,
                CommitmentConfig::confirmed()
            )
            .map_err(|e| anyhow!("Failed to send write buffer transaction: {}", e))?;

        println!("Wrote chunk {} to {}, signature: {}", offset, chunk_end, write_signature);
        
        offset = chunk_end;
    }

    println!("All buffer chunks written successfully!");

    // Add delay to ensure all chunks are confirmed
    println!("Waiting 2 seconds for confirmations...");
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    // Set buffer
    let idl_account_info = rpc_client.get_account(&idl_address)
        .map_err(|e| anyhow!("Failed to get IDL account info after initialization: {}", e))?;
    let buffer_account_info = rpc_client.get_account(&buffer_keypair.pubkey())
        .map_err(|e| anyhow!("Failed to get buffer account info: {}", e))?;

    let idl_account_size = idl_account_info.data.len();
    let buffer_account_size = buffer_account_info.data.len();

    println!("IDL account size: {}, Buffer account size: {}", idl_account_size, buffer_account_size);

    // Prepare transaction
    let mut instructions = vec![
        ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu),
        ComputeBudgetInstruction::set_compute_unit_limit(200000),
    ];

    // Handle resizing
    if buffer_account_size < idl_account_size {
        // Shrink IDL account to buffer size
        let resize = Resize {
            idl: idl_address,
            signer: signer.pubkey(),
            system_program: solana_sdk::system_program::ID,
            program_id: program_pubkey,
        }.instruction(ResizeInstructionArgs {
            len: buffer_account_size as u16,
            seed: IDL_SEED.to_string(),
        });
        instructions.push(resize);
    } else {
        let mut current_size = idl_account_size;
        let target_size = buffer_account_size;

        while current_size < target_size {
            let next_size = std::cmp::min(
                current_size + MAX_RESIZE_STEP as usize,
                target_size
            );

            let resize = Resize {
                idl: idl_address,
                signer: signer.pubkey(),
                system_program: solana_sdk::system_program::ID,
                program_id: program_pubkey,
            }.instruction(ResizeInstructionArgs {
                len: next_size as u16,
                seed: IDL_SEED.to_string(),
            });
            instructions.push(resize);

            println!("Adding resize instruction to size {}", next_size);
            current_size = next_size;
        }
    }

    // Add set buffer and close buffer instructions
    let set_buffer = SetBuffer {
        buffer: buffer_keypair.pubkey(),
        idl: idl_address,
        authority: signer.pubkey(),
        program_id: program_pubkey,
    }.instruction(SetBufferInstructionArgs {
        seed: IDL_SEED.to_string(),
    });
    println!("Set buffer instruction");
    instructions.push(set_buffer);

    let close_buffer = CloseBuffer {
        buffer: buffer_keypair.pubkey(),
        authority: signer.pubkey(),
    }.instruction();
    instructions.push(close_buffer);

    // Send transaction
    let recent_blockhash = rpc_client
        .get_latest_blockhash()
        .map_err(|e| anyhow!("Failed to get recent blockhash: {}", e))?;

    let transaction = Transaction::new_signed_with_payer(
        &instructions,
        Some(&signer.pubkey()),
        &[&signer],
        recent_blockhash,
    );

    let mut config = RpcSendTransactionConfig::default();
    config.skip_preflight = true;

    let signature = rpc_client
        .send_transaction_with_config(
            &transaction,
            config
        )
        .map_err(|e| anyhow!("Failed to send set buffer transaction: {}", e))?;

    println!("Buffer set and closed successfully!");
    println!("Final signature: {}", signature);

    Ok(())
} 