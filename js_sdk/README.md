# IDL Registry Program

## Description

A program that can save any metadata linked to your program.
The main usecase being IDL and a metadata json with name, logo and contact infos similar to security.txt.
The trick is that only the program upgrade authority can create the canonical PDA. This makes the metadata very easy to find by just using the seeds "idl", "metadata" or anything else you want.

Also instead of the whole IDL or metadata json people can choose to just upload a URL to the IDL instead to save on chain space and make updates easy.

## CLI Usage

### Installation

```bash
npm install -g my-idl-test
```

### Commands

#### Upload Metadata from JSON File

This will compress and write the metadata to the program's PDA.

```bash
program-metadata uploadMetadata \
  -k <keypair-path> \
  -j <json-path> \
  -p <program-id> \
  -u <rpc-url> \
  [-f <priority-fees>]
```

#### Upload IDL from JSON File

This will compress and write the IDL json file to the program's PDA.

```bash
program-metadata uploadIdl \
  -k <keypair-path> \
  -j <json-path> \
  -p <program-id> \
  -u <rpc-url> \
  [-f <priority-fees>]
```

#### Upload Metadata URL

This will just write a URL on chain to save on chain space and easy update.
You can host it where ever you want.

```bash
program-metadata uploadMetadataUrl \
  -k <keypair-path> \
  -j <url> \
  -p <program-id> \
  -u <rpc-url> \
  [-f <priority-fees>]
```

#### Upload IDL URL

This will just write a URL to the IDL on chain to save on chain space and easy update.
You can host it where ever you want.

```bash
program-metadata uploadIdlUrl \
  -k <keypair-path> \
  -j <url> \
  -p <program-id> \
  -u <rpc-url> \
  [-f <priority-fees>]
```

### Options

- `-k, --keypair <path>`: Path to keypair file (must be program's upgrade authority)
- `-j, --jsonPath <path>`: Path to JSON file for metadata/IDL
- `-j, --url <url>`: URL for metadata/IDL JSON
- `-p, --programId <address>`: Program ID
- `-u, --url <string>`: RPC URL (optional, defaults to local)
- `-f, --fees <number>`: Priority fees per compute unit (optional, defaults to 0)

### Example

```bash
npm run cli -- uploadMetadata \
  -k ./keypair.json \
  -j ./metadata.json \
  -p 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A \
  -u https://api.devnet.solana.com
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
- Create Rust CLI (assignee @wealthineer)
- Add Support for non canonical PDAs. Needed? Will make the program more complex.
- Add test case for bigger 10mb IDLs
- Write Web3js@2 cli using codama (generated client is already in the codama folder) (Good first issue)
- add fetchIDL and fetchMetadata
- add generic data upload to js cli

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

```bash
npm run cli uploadMetadata -k keypair.json -j metadata.json -p 6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A
```

Run tests

```bash
anchor test --detach
```

Like this you will be able to work locally without deploying the program to the network.
