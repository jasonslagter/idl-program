# Idl Registry Program

## Description

A program that similar to anchor uploads IDLs into a PDA. The difference being that you can build your program with `no-idl`to save space in the program because you don't need to inject extra instruction in your program.

Also instead of the whole IDL people can choose to just upload a URL to the IDL instead.

PDA can be easily retrieved using the seeds "idl" and the program id.
Authority can also be changed (not implemented yet)

Usage:

```ts
await UploadIdlUrl(url, programId, keypair, rpcUrl);
```

or

```ts
await UploadIdlByJsonPath(pathToJsonFile, programId, keypair, rpcUrl);
```

Then you can retrieve the IDL or URL using:

```ts
FetchIDL(programId);
```

TODO:

- Create JS library
- js v2
- Create Rust CLI (assignee @wealthineer)
- Add Support for non canonical PDAs
- Add test case for bigger 10mb IDLs
- Write Web3js@2 cli using codama (generated client is already in the codama folder) (Good first issue)
- Change tests to use jest and bankrun instead of mocha (Good first issue)

Done:

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
