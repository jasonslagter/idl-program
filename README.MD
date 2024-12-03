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

## TODO

- js v2 needed?
- move upgrade authority to multisig and deploy program to mainnet
- Create Rust CLI (assignee @wealthineer)
- Add Support for non canonical PDAs. Needed? Will make the program more complex.
- Add test case for bigger 10mb IDLs.
- Write Web3js@2 cli using codama (generated client is already in the codama folder) (Good first issue)
- validate URL parameters (e.g. no trailing slashes, starts with https:// etc.)
- refactor to make the program more metadata instead of only IDL focused

## Done

- Add URL support
- Add programId to PDA seeds
- Close Buffer account when done with it
- Remove signer from the PDA seeds and use the program authority check in program instead!
  - Now canonical IDL can actually be found by only the program id \o/
- Realloc when IDL becomes bigger or smaller than initially allocated
- Move realloc into set buffer and combine with close buffer
- Test case of < 10240 bytes IDL
- Enable tests for other ppl using a devnet program and hardcoded key for tests
- Remove anchor dependency from JS
- Add priority fees to transactions
- Add support for any program meta data using a dynamic seed string instead of hardcoded "idl"
- Add Test case for uploading program Logo meta data
- Add delete authority instruction
- Add change authority instruction
- Create JS library and CLI

## Local development

You can test the cli commands like this:

```bash
npm run cli -- idl upload ../tests/testidl.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A  -k "../tests/wallet2.json"

npm run cli -- metadata upload ../tests/metadata.json 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A  -k "../tests/wallet2.json"
```

Run tests

```bash
anchor test --detach
```

Like this you will be able to work locally without deploying the program to the network.
