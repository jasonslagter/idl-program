# Idl Registry Program

## Description

A program that similar to anchor uploads IDLs into a PDA. The difference being that you can build your program with `no-idl`to save space in the program because you don't need to inject extra instruction in your program.

Also instead of the whole IDL people can choose to just upload a URL to the IDL instead.

PDA can be easily retrieved using the seeds "idl" and the program id.
Authority can also be changed (not implemented yet)

Usage:

```ts
await InitIdlUrl(url, programId);
```

or

```ts
await InitIdlFile(pathToJsonFile, programId);
```

Then you can retrieve the IDL or URL using:

```ts
FetchIDL(programId);
```

TODO:

- Create JS library
- Create Rust CLI
- Add delete authority instruction
- Add change authority instruction
- Add test case for bigger 10mb IDLs
- Add priority fees to transactions
- Remove anchor dependency from JS
- Enable tests for other ppl using a devnet program and hardcoded key for tests

Done:

- Add URL support
- Add programId to PDA seeds
- Close Buffer account when done with it
- Remove signer from the PDA seeds and use the program authority check in program instead!
  - Now canonical IDL can actually be found by only the program id \o/
- Realloc when IDL becomes bigger or smaller than initially allocated
- Move realloc into set buffer and combine with close buffer
- Test case of < 10240 bytes IDL
