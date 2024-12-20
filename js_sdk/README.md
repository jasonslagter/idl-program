# Solana Program Metadata CLI 

## Table of Contents

- [Quick Start](#quick-start)
- [Description](#description)
- [CLI Usage](#cli-usage)
  - [Installation](#installation)
  - [Commands](#commands)
- [JavaScript Usage](#javascript-usage)
- [Non-Associated PDAs](#non-associated-pdas)

## Quick Start

```bash
# Install and upload IDL in one command
npx solana-program-metadata idl upload ./my-idl.json <program-id>
```

## Description

A Solana program for storing and retrieving program metadata on-chain. It enables:

- Storage of IDL files
- Program metadata (name, logo, contact info, etc.)
- Verifiable program information through upgrade authority validation
- Optional URL-based storage for reduced on-chain footprint

The trick is that only the program upgrade authority can create the associated PDA. This
makes the metadata very easy to find by just using the seeds "idl", "metadata" or anything
else you want.

At the moment the IDL and Metadata are not yet merged into Solana explorer but here is a
preview build that can show you how it looks like:
https://explorer-dun.vercel.app/address/6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A/program-metadata?cluster=devnet
https://explorer-dun.vercel.app/address/6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A/idl?cluster=devnet

## CLI Usage

### Installation

There is no need to install the CLI you can just run it with npx:

```bash
npx solana-program-metadata
```

### Commands

#### IDL Commands

Upload IDL from a JSON file. This will write the IDL compressed to the metadata account:

```bash
npx solana-program-metadata idl upload <file> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Upload IDL from URL. This will write a URL to a json file to the metadata account:

```bash
npx solana-program-metadata idl upload-url <url> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Download IDL to file:

```bash
npx solana-program-metadata idl download <program-id> [output-file] \
  [-u <rpc-url>]
```

#### Metadata Commands

You can also upload metadata for you program. This is the recommended format of the metadata json file. Similar to security.txt.

Create a template metadata.json file:

```bash
npx solana-program-metadata metadata init
```

```json
{
  "name": "MyProgramName",
  "logo": "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png",
  "description": "Example program for meta data",
  "notification": "On the first of january we will release a new version! Please update your SDKS!!!!",
  "sdk": "https://github.com/solana-developers/js_sdk",
  "project_url": "https://github.com/solana-developers/",
  "contacts": [
    "email:security@example.com",
    "discord:MyProgram#1234",
    "twitter:@MyProgram"
  ],
  "policy": "https://example.com/security-policy",
  "preferred_languages": ["en", "de"],
  "encryption": "https://example.com/pgp-key",
  "source_code": "https://github.com/solana-developers/",
  "source_release": "v0.1.0",
  "source_revision": "abc123def456",
  "auditors": ["Audit Firm A", "Security Researcher B"],
  "acknowledgements": "https://example.com/security-acknowledgements",
  "expiry": "2024-12-31",
  "version": "0.1.0"
}
```

Upload metadata from JSON file:

```bash
npx solana-program-metadata metadata upload <file> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Upload metadata from URL:

```bash
npx solana-program-metadata metadata upload-url <url> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Download metadata to file:

```bash
npx solana-program-metadata metadata download <program-id> [output-file] \
  [-u <rpc-url>]
```

### Options

- `-k, --keypair <path>`: Path to keypair file (optional, defaults to local Solana config)

* `-u, --url <string>`: Custom RPC URL (optional)
* `-ul, --url-local`: Use localhost RPC (default)
* `-ud, --url-devnet`: Use Devnet RPC
* `-um, --url-mainnet`: Use Mainnet RPC

- `-p, --priority-fees <number>`: Priority fees per compute unit (optional, defaults to 100000)

- `-a, --add-signer-seed`: Add signer's public key as additional seed. This will create not associated metadata which needs this seed to be found instead of just using the seeds "idl", "metadata" and the program id. (optional, defaults to false)

### Examples

```bash
# Upload IDL using default keypair that is the program authority
npx solana-program-metadata idl upload ./target/idl/my_program.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A

# Upload metadata with custom keypair to devnet
npx solana-program-metadata metadata upload ./metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k ./my-keypair.json \
  -ud

# Upload metadata with non-associated PDA (using signer's pubkey as additional seed creating a non associated metadata account)
npx solana-program-metadata metadata upload-url https://example.com/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  --add-signer-seed

# Download associated metadata (default)
npx solana-program-metadata metadata download 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A ./my-metadata.json

# Download non-associated metadata (requires signer's pubkey)
npx solana-program-metadata metadata download 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A ./my-metadata.json \
  -s tes5FTVnmJAeq2Nb1Uv15pqiRuPdCHmCSThVbUNfe37

npx solana-program-metadata idl upload tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

npx solana-program-metadata metadata upload tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

npx solana-program-metadata metadata upload-url https://raw.githubusercontent.com/solana-developers/idl-program/refs/heads/main/tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

```

## JavaScript Usage

```typescript
await uploadIdlUrl(url, programId, keypair, rpcUrl, priorityFees);
```

or

```typescript
await uploadIdlByJsonPath(
  pathToJsonFile,
  programId,
  keypair,
  rpcUrl,
  priorityFees
);
```

Then you can retrieve the IDL or URL using:

```typescript
await fetchIDL(programId, rpcUrl);
```

and the metadata using:

```typescript
await fetchProgramMetadata(programId, rpcUrl);
```

### Non-Associated PDAs

When using the `-a, --add-signer-seed` option, the program will add the signer's public key as an additional seed when deriving the PDA. This creates a non-associated PDA that is unique to that signer, allowing multiple metadata entries for the same program. Note that these can not easily be found anymore by just using the seeds "idl", "metadata" and the program id.
This can be useful though if there is some entity that wants to upload metadata for a program but does not have the authority to do so.

## Changelog

### 1.1.0 (2024-12-20)

#### Added

- New CLI Commands
  - `list-pdas`: View all metadata PDAs controlled by your authority
  - `list-buffers`: View all buffer accounts controlled by your authority
  - `close-buffer`: Recover rent from buffer accounts
  - `close-pda`: Close metadata PDA accounts and recover rent
- Multisig Support
  - Added `--export-only` flag for Squads integration
  - Returns base58 and base64 encoded transactions for multisig execution

#### Improved

- Account Structure
  - Separated `MetadataBuffer` from `MetadataAccount2` for better type safety
  - Added program ID to buffer accounts for better tracking
- CLI Output
  - Enhanced listing displays with program ID, data length, and data type
  - Better formatted console output
- Error Handling
  - More descriptive error messages
  - Better validation of inputs

#### Technical

- Refactored account listing logic into reusable functions
- Improved TypeScript type definitions
- Better code organization and maintainability

### 1.0.0

- added automatic rpc url and local keypair loading
- added close metadata account instruction
- added data type field to metadata account

- **Breaking**: Changed metadata account structure. Users must:
  1. Close existing metadata accounts using `close1` instruction
  2. Create new metadata accounts with updated structure
  3. Seed derivation changed to have the dynamic seed at the end for security reasons
