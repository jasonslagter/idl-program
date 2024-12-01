# Metadata Rust CLI

This CLI is used to interact with the metadata program.

## Usage

```bash
rust-cli [SUBCOMMAND]
```

### Commands

#### IDL Management

```bash
# Upload an IDL file
rust-cli idl upload <IDL_PATH> <PROGRAM_ID> [OPTIONS]

Options:
  -k, --keypair <PATH>           Path to keypair file (optional, defaults to config)
  -p, --priority-fees <NUMBER>   Priority fees per compute unit (default: 0)
  --help                         Print help information
```

Example:

```bash
# Upload IDL using default keypair
rust-cli idl upload ./target/idl/my_program.json GrAkz4CQ4zKm9KhZ9Q7PkCmqDP7JuSGbpwGY8dxKt6Kj

# Upload IDL with custom keypair and priority fees
rust-cli idl upload ./target/idl/my_program.json GrAkz4CQ4zKm9KhZ9Q7PkCmqDP7JuSGbpwGY8dxKt6Kj -k ./my-keypair.json -p 1000
```

## Testing the Rust CLI against a local validator from within this repository

Start your local validator:

```bash
solana-test-validator --reset
```

Make sure you point your cluster to localnet and fix the program id in `Anchor.toml`.
Fix the program id in `programs/upload-idl-program/src/lib.rs` and `rust_cli/src/codama_sdk/programs.rs`.
Deploy the metadata program using anchor:

```bash
anchor build
anchor deploy
```

Airdrop SOL to your keypair - make sure to point your solana cli to localnet:

```bash
solana config set --url localhost
solana airdrop 20 -k tests/wallet.json  
```

Deploy any program using the keypair in `tests/wallet.json`:

```bash
 solana program deploy <path/to/any-program>.so -k tests/wallet.json
```

Run the CLI upload for the program you just deployed:

```bash
cargo run -- idl upload tests/testidl.json <program-id> -k tests/wallet.json -p 0
```

