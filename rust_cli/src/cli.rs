use clap::{App, Arg, SubCommand};

pub fn get_clap_app() -> App<'static, 'static> {
    App::new("rust-cli")
        .about("A Solana CLI application")
        .version("0.1.0")
        
        .subcommand(
            SubCommand::with_name("idl")
                .about("IDL management commands")
                .subcommand(
                    SubCommand::with_name("upload")
                        .about("Upload IDL from JSON file")
                        .arg(
                            Arg::with_name("idl-path")
                                .help("Path to the IDL JSON file")
                                .required(true)
                                .index(1)
                        )
                        .arg(
                            Arg::with_name("program-id")
                                .short("pid")
                                .help("Program ID")
                                .required(true)
                                .index(2)
                        )
                        .arg(
                            Arg::with_name("keypair")
                                .help("Path to keypair file (optional, defaults to config)")
                                .short("k")
                                .long("keypair")
                                .takes_value(true)
                                .required(false)
                        )
                        .arg(
                            Arg::with_name("priority-fees-per-cu")
                                .help("Priority fees per compute unit")
                                .short("p")
                                .long("priority-fees")
                                .takes_value(true)
                                .default_value("0")
                        )
                )
        )
        .subcommand(
            SubCommand::with_name("metadata")
                .about("Metadata management commands")
                .subcommand(
                    SubCommand::with_name("upload")
                        .about("Upload Metadata from JSON file")
                        .arg(
                            Arg::with_name("metadata-path")
                                .help("Path to the Metadata JSON file")
                                .required(true)
                                .index(1)
                        )
                        .arg(
                            Arg::with_name("program-id")
                                .short("pid")
                                .help("Program ID")
                                .required(true)
                                .index(2)
                        )
                        .arg(
                            Arg::with_name("keypair")
                                .help("Path to keypair file (optional, defaults to config)")
                                .short("k")
                                .long("keypair")
                                .takes_value(true)
                                .required(false)
                        )
                        .arg(
                            Arg::with_name("priority-fees-per-cu")
                                .help("Priority fees per compute unit")
                                .short("p")
                                .long("priority-fees")
                                .takes_value(true)
                                .default_value("0")
                        )
                )
        )
} 