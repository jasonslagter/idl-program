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
- `-u, --url <string>`: RPC URL (optional, defaults to http://127.0.0.1:8899)
- `-p, --priority-fees <number>`: Priority fees per compute unit (optional, defaults to 0)

### Examples

```bash
# Upload IDL using default keypair
program-metadata idl upload ./target/idl/my_program.json GrAkz4CQ4zKm9KhZ9Q7PkCmqDP7JuSGbpwGY8dxKt6Kj

# Upload metadata with custom keypair and RPC URL
program-metadata metadata upload ./metadata.json GrAkz4CQ4zKm9KhZ9Q7PkCmqDP7JuSGbpwGY8dxKt6Kj \
  -k ./my-keypair.json \
  -u https://api.devnet.solana.com

program-metadata idl upload tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -u https://api.devnet.solana.com

program-metadata metadata upload tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -u https://api.devnet.solana.com

program-metadata metadata upload-url https://raw.githubusercontent.com/solana-developers/idl-program/refs/heads/main/tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -k tests/wallet2.json -u https://api.devnet.solana.com

# Download IDL to custom file
program-metadata idl download GrAkz4CQ4zKm9KhZ9Q7PkCmqDP7JuSGbpwGY8dxKt6Kj ./my-idl.json

# Local development examples
npm run cli -- idl upload ../tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A -k ../tests/wallet2.json
npm run cli -- metadata upload ../tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A -k ../tests/wallet2.json
```

## JavaScript Usage

```typescript
await UploadIdlUrl(url, programId, keypair, rpcUrl);
```

or

```typescript
await UploadIdlByJsonPath(pathToJsonFile, programId, keypair, rpcUrl);
```

Then you can retrieve the IDL or URL using:

```typescript
FetchIDL(programId);
```

and the metadata using:

```typescript
FetchMetadata(programId);
```
