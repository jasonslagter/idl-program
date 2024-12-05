# IDL Registry Program

## Description

A program that can save any metadata linked to your program.
The main usecase being IDL and a metadata json with name, logo and contact infos similar to security.txt.
The trick is that only the program upgrade authority can create the canonical PDA. This makes the metadata very easy to find by just using the seeds "idl", "metadata" or anything else you want.

Also instead of the whole IDL or metadata json people can choose to just upload a URL to the IDL instead to save on chain space and make updates easy.

## CLI Usage

### Installation

```bash
npm install -g solana-program-metadata
```

### Commands

#### IDL Commands

Upload IDL from a JSON file:

```bash
program-metadata idl upload <file> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Upload IDL from URL:

```bash
program-metadata idl upload-url <url> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Download IDL to file:

```bash
program-metadata idl download <program-id> [output-file] \
  [-u <rpc-url>]
```

#### Metadata Commands

You can also upload metadata for you program. This is the recommended format of the metadata json file. Similar to security.txt.

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
program-metadata metadata upload <file> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Upload metadata from URL:

```bash
program-metadata metadata upload-url <url> <program-id> \
  [-k <keypair-path>] \
  [-u <rpc-url>] \
  [-p <priority-fees>]
```

Download metadata to file:

```bash
program-metadata metadata download <program-id> [output-file] \
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
# Upload IDL using default keypair
program-metadata idl upload ./target/idl/my_program.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A

# Upload metadata with custom keypair
program-metadata metadata upload ./metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k ./my-keypair.json \
  -ud

# Upload metadata with non-associated PDA (using signer's pubkey as additional seed)
program-metadata metadata upload-url https://example.com/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  --add-signer-seed

# Download associated metadata (default)
program-metadata metadata download 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A ./my-metadata.json

# Download non-associated metadata (requires signer's pubkey)
program-metadata metadata download 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A ./my-metadata.json \
  -s tes5FTVnmJAeq2Nb1Uv15pqiRuPdCHmCSThVbUNfe37

program-metadata idl upload tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

program-metadata metadata upload tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

program-metadata metadata upload-url https://raw.githubusercontent.com/solana-developers/idl-program/refs/heads/main/tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -ud

# Local development examples
npm run cli -- idl upload ../tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A -k ../tests/wallet2.json

npm run cli -- metadata upload ../tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A -k ../tests/wallet2.json

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
