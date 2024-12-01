mod commands;
mod config;
mod cli;
mod codama_sdk;
use codama_sdk::programs::UPLOAD_IDL_ANCHOR_ID;

use anyhow::{Result, anyhow};

fn main() -> Result<()> {
    let matches = cli::get_clap_app().get_matches();

    match matches.subcommand() {
        ("idl", Some(idl_matches)) => {
            match idl_matches.subcommand() {
                ("upload", Some(upload_matches)) => {
                    let idl_path = upload_matches.value_of("idl-path").unwrap();
                    let program_id = upload_matches.value_of("program-id").unwrap();
                    let keypair_path = upload_matches.value_of("keypair");
                    let priority_fees_per_cu = upload_matches
                        .value_of("priority-fees-per-cu")
                        .unwrap_or("0")
                        .parse::<u64>()
                        .map_err(|_| anyhow!("Invalid priority fees value"))?;
                    
                    commands::idl::upload_idl_by_json_path(idl_path, program_id, keypair_path, priority_fees_per_cu)
                }
                _ => {
                    println!("Unknown IDL command. Use --help to see available commands");
                    Ok(())
                }
            }
        }
        _ => {
            println!("Please use --help to see available commands");
            Ok(())
        }
    }
}
