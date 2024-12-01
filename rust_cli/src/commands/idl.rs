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
        create_buffer::CreateBufferBuilder,
        write_buffer::{WriteBuffer, WriteBufferInstructionArgs},
        set_buffer::{SetBuffer, SetBufferInstructionArgs},
        close_buffer::CloseBuffer,
    },
    programs::UPLOAD_IDL_ANCHOR_ID,
};
use reqwest::blocking::Client;

const IDL_SEED: &str = "idl";
const METADATA_SEED: &str = "metadata";
const METADATA_OFFSET: usize = 44;
const CHUNK_SIZE: u16 = 900;
const MAX_RESIZE_STEP: u16 = 10240;



pub fn upload_idl_by_json_path(
    idl_path: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
) -> Result<()> {
    upload_data_by_json_path(idl_path, program_id, keypair_path, priority_fees_per_cu, IDL_SEED)
}

pub fn upload_metadata_by_json_path(
    metadata_path: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
) -> Result<()> {
    upload_data_by_json_path(metadata_path, program_id, keypair_path, priority_fees_per_cu, METADATA_SEED)
}

pub fn upload_idl_by_json_url(
    url: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
) -> Result<()> {
    let json_data = fetch_json_from_url(url)?;
    upload_data_from_bytes(json_data, program_id, keypair_path, priority_fees_per_cu, IDL_SEED)
}

pub fn upload_metadata_by_json_url(
    url: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
) -> Result<()> {
    let json_data = fetch_json_from_url(url)?;
    upload_data_from_bytes(json_data, program_id, keypair_path, priority_fees_per_cu, METADATA_SEED)
}

fn fetch_json_from_url(url: &str) -> Result<Vec<u8>> {
    let client = Client::new();
    let response = client.get(url)
        .send()
        .map_err(|e| anyhow!("Failed to fetch from URL: {}", e))?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Failed to fetch URL: HTTP {}", response.status()));
    }

    response.bytes()
        .map_err(|e| anyhow!("Failed to read response body: {}", e))
        .map(|b| b.to_vec())
}

// Refactor the existing upload_data_by_json_path to use this new function
fn upload_data_by_json_path(
    json_path: &str,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
    seed: &str,
) -> Result<()> {
    let json_data = fs::read(json_path)
        .map_err(|e| anyhow!("Failed to read JSON file: {}", e))?;
    upload_data_from_bytes(json_data, program_id, keypair_path, priority_fees_per_cu, seed)
}

// New core function that handles the actual upload
fn upload_data_from_bytes(
    json_data: Vec<u8>,
    program_id: &str,
    keypair_path: Option<&str>,
    priority_fees_per_cu: u64,
    seed: &str,
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

    // Parse program ID
    let program_pubkey = Pubkey::from_str(program_id)
        .map_err(|e| anyhow!("Invalid program ID: {}", e))?;

    println!("Signer: {}", signer.pubkey());

    // Get account address
    let (account_address, _) = Pubkey::find_program_address(
        &[seed.as_bytes(), program_pubkey.as_ref()],
        &UPLOAD_IDL_ANCHOR_ID,
    );

    // Initialize account
    initialize(program_id, &signer, priority_fees_per_cu, seed)?;

    // Create buffer
    let (compressed_data, buffer_keypair) = create_buffer(json_data, &rpc_client, &signer, priority_fees_per_cu)?;

    // Write buffer
    write_buffer(compressed_data, &buffer_keypair, &signer, &rpc_client, priority_fees_per_cu)?;

    // Set and close buffer
    set_and_close_buffer(rpc_client, account_address, buffer_keypair, priority_fees_per_cu, signer, program_pubkey, seed)?;
    
    Ok(())
}



//Sub-transactions
fn initialize(
    program_id: &str,
    signer: &Keypair,
    priority_fees_per_cu: u64,
    seed: &str,
) -> Result<()> {
    let (_, rpc_client) = get_user_config()?;
    
    // Parse program ID
    let program_pubkey = Pubkey::from_str(program_id)
        .map_err(|e| anyhow!("Invalid program ID: {}", e))?;

    // Derive PDA for IDL account
    let (idl_address, _) = Pubkey::find_program_address(
        &[seed.as_bytes(), program_pubkey.as_ref()],
        &UPLOAD_IDL_ANCHOR_ID
    );

    // Check if account already exists
    if let Ok(_) = rpc_client.get_account(&idl_address) {
        println!("Data account already exists");
        return Ok(());
    }

    println!("Initializing Data with seed: {}", seed);

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
        seed: seed.to_string(),
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

    println!("Data initialized successfully!");
    println!("Signature: {}", signature);
    println!("Data Account: {}", idl_address);
    
    Ok(())
}

fn create_buffer(
    idl_data: Vec<u8>, 
    rpc_client: &solana_client::rpc_client::RpcClient, 
    signer: &Keypair, 
    priority_fees_per_cu: u64
) -> Result<(Vec<u8>, Keypair), anyhow::Error> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&idl_data)?;
    let compressed_data = encoder.finish()?;
    let data_len = compressed_data.len() + METADATA_OFFSET;
    let buffer_keypair = Keypair::new();
    let rent = rpc_client.get_minimum_balance_for_rent_exemption(data_len)
        .map_err(|e| anyhow!("Failed to get rent: {}", e))?;
    let create_account_ix = solana_sdk::system_instruction::create_account(
        &signer.pubkey(),
        &buffer_keypair.pubkey(),
        rent,
        data_len as u64,
        &UPLOAD_IDL_ANCHOR_ID,
    );
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
            &[signer, &buffer_keypair],
            recent_blockhash,
        );
    let signature = rpc_client
        .send_and_confirm_transaction_with_spinner_and_commitment(&transaction, CommitmentConfig::confirmed())
        .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;
    println!("Buffer account created successfully!");
    println!("Signature: {}", signature);
    println!("Buffer Account: {}", buffer_keypair.pubkey());
    Ok((compressed_data, buffer_keypair))
} 


fn write_buffer(
    compressed_data: Vec<u8>, 
    buffer_keypair: &Keypair, 
    signer: &Keypair, rpc_client: &solana_client::rpc_client::RpcClient, 
    priority_fees_per_cu: u64
) -> Result<(), anyhow::Error> {
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
            &[signer],
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

    Ok(())
}

fn set_and_close_buffer(
    rpc_client: solana_client::rpc_client::RpcClient, 
    idl_address: Pubkey, 
    buffer_keypair: Keypair, 
    priority_fees_per_cu: u64, 
    signer: Keypair, 
    program_pubkey: Pubkey,
    seed: &str,
) -> Result<(), anyhow::Error> {
    // Try to get account info with retries
    let mut attempts = 0;
    let max_attempts = 10;
    
    let (idl_account_info, buffer_account_info) = loop {
        match (
            rpc_client.get_account(&idl_address),
            rpc_client.get_account(&buffer_keypair.pubkey())
        ) {
            (Ok(idl), Ok(buffer)) => break (idl, buffer),
            (Err(e), _) | (_, Err(e)) => {
                attempts += 1;
                if attempts >= max_attempts {
                    return Err(anyhow!("Failed to get account info after {} attempts: {}", max_attempts, e));
                }
                println!("Failed to get account info, retrying in 2 seconds... (attempt {}/{})", attempts, max_attempts);
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        }
    };

    let idl_account_size = idl_account_info.data.len();
    let buffer_account_size = buffer_account_info.data.len();
    
    println!("Data account size: {}, Buffer account size: {}", idl_account_size, buffer_account_size);
    let mut instructions = vec![
        ComputeBudgetInstruction::set_compute_unit_price(priority_fees_per_cu),
        ComputeBudgetInstruction::set_compute_unit_limit(200000),
    ];
    if buffer_account_size < idl_account_size {
        // Shrink IDL account to buffer size
        let resize = Resize {
            idl: idl_address,
            signer: signer.pubkey(),
            system_program: solana_sdk::system_program::ID,
            program_id: program_pubkey,
        }.instruction(ResizeInstructionArgs {
            len: buffer_account_size as u16,
            seed: seed.to_string(),
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
                seed: seed.to_string(),
            });
            instructions.push(resize);

            println!("Adding resize instruction to size {}", next_size);
            current_size = next_size;
        }
    }
    let set_buffer = SetBuffer {
        buffer: buffer_keypair.pubkey(),
        idl: idl_address,
        authority: signer.pubkey(),
        program_id: program_pubkey,
    }.instruction(SetBufferInstructionArgs {
        seed: seed.to_string(),
    });
    println!("Set buffer instruction");
    instructions.push(set_buffer);
    let close_buffer = CloseBuffer {
        buffer: buffer_keypair.pubkey(),
        authority: signer.pubkey(),
    }.instruction();
    instructions.push(close_buffer);
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
        .send_and_confirm_transaction_with_spinner_and_commitment(
            &transaction,
            CommitmentConfig::confirmed()
        )
        .map_err(|e| anyhow!("Failed to send set buffer transaction: {}", e))?;
    println!("Buffer set and closed successfully!");
    println!("Final signature: {}", signature);
    Ok(())
}



    