use anyhow::{Result, anyhow};
use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    transaction::Transaction,
    signer::Signer,
    compute_budget::ComputeBudgetInstruction,
};
use std::{str::FromStr, fs};
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



pub fn initialize_idl(
    program_id: &str,
    signer: Keypair,
    priority_fees_per_cu: u64,
) -> Result<()> {

    let (_, rpc_client) = get_user_config()?;
    
    // Parse program ID
    let program_pubkey = Pubkey::from_str(program_id)
        .map_err(|e| anyhow!("Invalid program ID: {}", e))?;

    // Derive PDA for IDL account
    let (idl_address, _) = Pubkey::find_program_address(
        &[b"idl", program_pubkey.as_ref()],
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
        &[&signer],
        recent_blockhash,
    );

    let simulation = rpc_client.simulate_transaction(&transaction_to_simulate)
    .map_err(|e| anyhow!("Failed to simulate transaction: {}", e))?;
    println!("Simulation: {:?}", simulation);

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
        .send_and_confirm_transaction_with_spinner(&transaction)
        .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;

    println!("IDL initialized successfully!");
    println!("Signature: {}", signature);
    println!("IDL Account: {}", idl_address);
    
    Ok(())
}

pub async fn upload_idl_by_json_path(
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
    let _idl_data = fs::read(idl_path)
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
        initialize_idl( program_id, signer, priority_fees_per_cu)?;
    }

    // Create buffer
    // let buffer_keypair = Keypair::new();
    // let create_buffer = CreateBufferBuilder::new()
    //     .buffer(buffer_keypair.pubkey())
    //     .authority(signer.pubkey())
    //     .instruction();

    // // Write buffer
    // let write_buffer = WriteBuffer {
    //     buffer: buffer_keypair.pubkey(),
    //     signer: signer.pubkey(),
    //     system_program: solana_sdk::system_program::ID,
    // };
    // let write_args = WriteBufferInstructionArgs {
    //     idl_data: idl_data.to_vec(),
    // };

    // // Set buffer
    // let set_buffer = SetBuffer {
    //     buffer: buffer_keypair.pubkey(),
    //     idl: idl_address,
    //     authority: signer.pubkey(),
    //     program_id: program_pubkey,
    // };
    // let set_args = SetBufferInstructionArgs {
    //     seed: "idl".to_string(),
    // };

    // // Close buffer
    // let close_buffer = CloseBuffer {
    //     buffer: buffer_keypair.pubkey(),
    //     authority: signer.pubkey(),
    // };

    // // Create transaction
    // let recent_blockhash = rpc_client
    //     .get_latest_blockhash()
    //     .map_err(|e| anyhow!("Failed to get recent blockhash: {}", e))?;

    // let transaction = Transaction::new_signed_with_payer(
    //     &[
    //         create_buffer,
    //         write_buffer.instruction(write_args),
    //         set_buffer.instruction(set_args),
    //         close_buffer.instruction(),
    //     ],
    //     Some(&signer.pubkey()),
    //     &[&signer, &buffer_keypair],
    //     recent_blockhash,
    // );

    // // Send and confirm transaction
    // let signature = rpc_client
    //     .send_and_confirm_transaction(&transaction)
    //     .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;

    // println!("IDL uploaded successfully!");
    // println!("Signature: {}", signature);
    // println!("IDL Account: {}", idl_address);

    Ok(())
} 