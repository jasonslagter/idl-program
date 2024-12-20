#!/usr/bin/env node

import { Command } from "commander";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import {
  uploadProgramMetadataByJsonPath,
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByUrl,
  fetchIDL,
  fetchProgramMetadata,
  closeProgramMetadata1,
  closeProgramMetadata2,
  closeBuffer,
  listBuffers,
  listPDAs,
  closeProgramMetadataByPdaAddress,
} from "./ProgramMetaData";
import fs from "fs";
import os from "os";
import path from "path";
import { decodeUpgradeableLoaderState } from "@coral-xyz/anchor/dist/cjs/utils/registry";
import { ProgramMetaData } from "./ProgramMetaData";

const LOCALHOST_URL = "http://127.0.0.1:8899";
const DEVNET_URL = "https://api.devnet.solana.com";
const MAINNET_URL = "https://api.mainnet-beta.solana.com";

const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";
const BPF_LOADER_2 = "BPFLoader2111111111111111111111111111111111";
const BPF_LOADER = "BPFLoader1111111111111111111111111111111111";

const AUTHORITY_WARNING_MESSAGE =
  "\x1b[33mWarning: The selected keypair is not the program's authority. Only the authority can upload the associated metadta for a program. You can however use the flag -a to add the signer's public key as additional seed. Note: Like that you need to know that seed to find the PDA later. \x1b[0m";

const program = new Command();

program
  .name("program-metadata")
  .description("CLI to manage Solana program metadata and IDL")
  .version("0.0.13");

// IDL Commands
const idlCommand = program
  .command("idl")
  .description("IDL management commands");

async function checkProgramAuthority(
  programId: PublicKey,
  authority: PublicKey,
  rpcUrl: string
): Promise<boolean> {
  try {
    console.log("rpcUrl", rpcUrl);
    const connection = new Connection(rpcUrl);
    let programAccount;
    try {
      programAccount = await connection.getParsedAccountInfo(programId);
    } catch (error) {
      console.error("Error getting program account:", error);
      process.exit(1);
    }

    console.log("Program Loader: ", programAccount.value?.owner.toBase58());

    if (!programAccount.value) {
      throw new Error("Program account not found");
    }

    // Check if the account is actually a program
    if (!programAccount.value.executable) {
      throw new Error("Account is not a program");
    }

    const programOwner = programAccount.value.owner;

    // For BPFLoaderUpgradeable programs, derive the program data account
    if (programOwner.equals(new PublicKey(BPF_LOADER_UPGRADEABLE))) {
      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [programId.toBuffer()],
        new PublicKey(BPF_LOADER_UPGRADEABLE)
      );

      const programDataAccount = await connection.getAccountInfo(
        programDataAddress
      );
      if (!programDataAccount) {
        throw new Error("Program data account not found");
      }

      const programData = decodeUpgradeableLoaderState(programDataAccount.data);
      console.log(
        `Program authority: ${programData?.programData?.upgradeAuthorityAddress?.toBase58()} Provided authority: ${authority.toBase58()}`
      );

      if (programData?.programData?.upgradeAuthorityAddress) {
        return programData.programData.upgradeAuthorityAddress.equals(
          authority
        );
      }
    }

    // For BPFLoader2 programs, check direct ownership
    if (programOwner.equals(new PublicKey(BPF_LOADER_2))) {
      // BPFLoader2 programs don't store authority if they're not upgradeable
      return false;
    }

    // For original BPFLoader programs, check direct ownership
    if (programOwner.equals(new PublicKey(BPF_LOADER))) {
      // Original BPFLoader programs don't store authority
      return false;
    }

    return false;
  } catch (error) {
    console.error("Error checking program authority:", error);
    process.exit(1);
  }
}

idlCommand
  .command("upload <file> <program-id>")
  .description("Upload IDL from a file")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed. This will create a non associated metadata account. ",
    false
  )
  .option("--export-transaction", "Only create buffer and export setBuffer transaction")
  .action(async (file, programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      const isAuthority = await checkProgramAuthority(
        new PublicKey(programId),
        keypair.publicKey,
        rpcUrl
      );

      if (!isAuthority) {
        console.warn(AUTHORITY_WARNING_MESSAGE);
        return;
      }

      const result = await uploadIdlByJsonPath(
        file,
        new PublicKey(programId),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees),
        options.addSignerSeed,
        options.exportTransaction
      );

      if (options.exportTransaction && result) {
        console.log("Exported setBuffer transaction with programAuthority as signer:");
        console.log("Base58:", result.base58);
        console.log("Base64:", result.base64);
      } else {
        console.log("IDL uploaded successfully!");
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

idlCommand
  .command("upload-url <url> <program-id>")
  .description("Upload IDL from URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed. This will create a non associated metadata account. ",
    false
  )
  .option("--export-transaction", "Only create buffer and export setBuffer transaction")
  .action(async (url, programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      const isAuthority = await checkProgramAuthority(
        new PublicKey(programId),
        keypair.publicKey,
        rpcUrl
      );

      if (!isAuthority) {
        console.warn(AUTHORITY_WARNING_MESSAGE);
        return;
      }

      const result = await uploadIdlUrl(
        url,
        new PublicKey(programId),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees),
        options.addSignerSeed,
        options.exportTransaction
      );

      if (options.exportTransaction && result) {
        console.log("Exported setBuffer transaction with programAuthority as signer:");
        console.log("Base58:", result.base58);
        console.log("Base64:", result.base64);
      } else {
        console.log("IDL URL uploaded successfully!");
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

idlCommand
  .command("download <program-id> [output]")
  .description("Download IDL to file")
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-s, --signer <pubkey>",
    "Additional signer public key to find non-associated PDAs"
  )
  .action(async (programId, output = "idl.json", options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const signerPubkey = options.signer
        ? new PublicKey(options.signer)
        : undefined;
      const idl = await fetchIDL(
        new PublicKey(programId),
        rpcUrl,
        signerPubkey
      );
      if (!idl) {
        throw new Error("No IDL found");
      }
      fs.writeFileSync(output, idl ?? "");
      console.log(`IDL downloaded to ${output}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

// Metadata Commands
const metadataCommand = program
  .command("metadata")
  .description("Metadata management commands");

metadataCommand
  .command("upload <file> <program-id>")
  .description("Upload metadata from a file")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed. This will create a non associated metadata account. ",
    false
  )
  .option("--export-transaction", "Only create buffer and export setBuffer transaction")
  .action(async (file, programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      const isAuthority = await checkProgramAuthority(
        new PublicKey(programId),
        keypair.publicKey,
        rpcUrl
      );

      if (!isAuthority) {
        console.warn(AUTHORITY_WARNING_MESSAGE);
        return;
      }

      const result = await uploadProgramMetadataByJsonPath(
        file,
        new PublicKey(programId),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees),
        options.addSignerSeed,
        options.exportTransaction
      );

      if (options.exportTransaction && result) {
        console.log("Exported setBuffer transaction with programAuthority as signer:");
        console.log("Base58:", result.base58);
        console.log("Base64:", result.base64);
      } else {
        console.log("Metadata uploaded successfully!");
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("upload-url <url> <program-id>")
  .description("Upload metadata from URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed. This will create a non associated metadata account. ",
    false
  )
  .option("--export-transaction", "Only create buffer and export setBuffer transaction")
  .action(async (url, programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      const isAuthority = await checkProgramAuthority(
        new PublicKey(programId),
        keypair.publicKey,
        rpcUrl
      );

      if (!isAuthority) {
        console.warn(AUTHORITY_WARNING_MESSAGE);
        return;
      }

      const result = await uploadProgramMetadataByUrl(
        url,
        new PublicKey(programId),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees),
        options.addSignerSeed,
        options.exportTransaction
      );

      if (options.exportTransaction && result) {
        console.log("Exported setBuffer transaction with programAuthority as signer:");
        console.log("Base58:", result.base58);
        console.log("Base64:", result.base64);
      } else {
        console.log("Metadata URL uploaded successfully!");
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("download <program-id> [output]")
  .description("Download metadata to file")
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .option(
    "-s, --signer <pubkey>",
    "Additional signer public key to find non-associated PDAs"
  )
  .action(async (programId, output = "metadata.json", options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const signerPubkey = options.signer
        ? new PublicKey(options.signer)
        : undefined;
      const metadata = await fetchProgramMetadata(
        new PublicKey(programId),
        rpcUrl,
        signerPubkey
      );
      fs.writeFileSync(output, JSON.stringify(metadata, null, 2));
      console.log(`Metadata downloaded to ${output}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("close <program-id>")
  .description("Close metadata account and recover rent")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .requiredOption(
    "-s, --seed <string>",
    "Seed for the account to close (metadata or idl)"
  )
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed. This will create a non associated metadata account. ",
    false
  )
  .action(async (programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      const isAuthority = await checkProgramAuthority(
        new PublicKey(programId),
        keypair.publicKey,
        rpcUrl
      );

      if (!isAuthority) {
        console.warn(AUTHORITY_WARNING_MESSAGE);
        return;
      }

      await closeProgramMetadata2(
        new PublicKey(programId),
        keypair,
        rpcUrl,
        options.seed,
        parseInt(options.priorityFees),
        options.addSignerSeed
      );
      console.log("Metadata account closed successfully!");
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("close1 <program-id>")
  .description("Close metadata account v1 and recover rent")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .requiredOption(
    "-s, --seed <string>",
    "Seed for the account to close (metadata or idl)"
  )
  .option(
    "-a, --add-signer-seed",
    "Add signer's public key as additional seed",
    false
  )
  .action(async (programId, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      await closeProgramMetadata1(
        new PublicKey(programId),
        keypair,
        rpcUrl,
        options.seed,
        parseInt(options.priorityFees),
        options.addSignerSeed
      );
      console.log("Metadata account v1 closed successfully!");
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("init [output]")
  .description("Create a template metadata.json file")
  .action((output = "metadata.json") => {
    try {
      const templateMetadata: ProgramMetaData = {
        name: "My Program Name",
        version: "1.0.0",
        description: "A description of what my program does",
        logo: "https://example.com/logo.png",
        project_url: "https://example.com/my-project",
        contacts: [
          "https://twitter.com/username",
          "https://github.com/username",
          "Discord: username#1234",
          "Email: dev@example.com",
        ],
        source_code: "https://github.com/username/repo",
        source_release: "v1.0.0",
        source_revision: "abc123...",
        sdk: "https://www.npmjs.com/package/my-sdk",
        preferred_languages: ["Rust", "TypeScript"],
        policy: "https://example.com/terms",
        auditors: ["Auditor Company Name"],
        acknowledgements: "Thanks to...",
        expiry: "2025-12-31",
        notification: "Important update coming soon!",
        encryption: "none",
      };

      fs.writeFileSync(output, JSON.stringify(templateMetadata, null, 2));
      console.log(`Template metadata file created at ${output}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("close-buffer <buffer-address>")
  .description("Close a buffer account and recover rent")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .action(async (bufferAddress, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(options.keypair, "utf-8")))
          )
        : loadDefaultKeypair();

      await closeBuffer(
        new PublicKey(bufferAddress),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees)
      );
      console.log("Buffer account closed successfully!");
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("list-buffers")
  .description("List all buffer accounts owned by an authority")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .action(async (options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(options.keypair, "utf-8")))
          )
        : loadDefaultKeypair();

      const buffers = await listBuffers(keypair.publicKey, rpcUrl);
      
      if (buffers.length === 0) {
        console.log("No buffers found for this authority");
        return;
      }

      console.log("\nFound buffers:");
      buffers.forEach(({ address, dataLength, dataType }) => {
        console.log(`\nAddress: ${address.toBase58()}`);
        console.log(`Data Length: ${dataLength} bytes`);
        console.log(`Data Type: ${dataType}`);
      });
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("list-pdas")
  .description("List all metadata PDAs owned by an authority")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .action(async (options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(options.keypair, "utf-8")))
          )
        : loadDefaultKeypair();

      const pdas = await listPDAs(keypair.publicKey, rpcUrl);
      
      if (pdas.length === 0) {
        console.log("No PDAs found for this authority");
        return;
      }

      console.log("\nFound PDAs:");
      pdas.forEach(({ address, dataLength, dataType, programId }) => {
        console.log(`\nAddress: ${address.toBase58()}`);
        console.log(`Program ID: ${programId.toBase58()}`);
        console.log(`Data Length: ${dataLength} bytes`);
        console.log(`Data Type: ${dataType}`);
      });
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

metadataCommand
  .command("close-pda <pda-address>")
  .description("Close a metadata PDA account and recover rent")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option(
    "-p, --priority-fees <number>",
    "Priority fees per compute unit",
    "100000"
  )
  .option("-u, --url <string>", "Custom RPC URL")
  .option("-ul, --url-local", "Use localhost RPC (default)")
  .option("-ud, --url-devnet", "Use Devnet RPC")
  .option("-um, --url-mainnet", "Use Mainnet RPC")
  .action(async (pdaAddress, options) => {
    try {
      const rpcUrl = getRpcUrl(options);
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(options.keypair, "utf-8")))
          )
        : loadDefaultKeypair();

      await closeProgramMetadataByPdaAddress(
        new PublicKey(pdaAddress),
        keypair,
        rpcUrl,
        parseInt(options.priorityFees)
      );
      console.log("Metadata PDA closed successfully!");
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      process.exit(1);
    }
  });

// Helper function to load default keypair
function loadDefaultKeypair(): Keypair {
  try {
    // Get default Solana keypair path
    const CONFIG_FILE_PATH = path.join(
      os.homedir(),
      ".config",
      "solana",
      "id.json"
    );

    // Check if the file exists
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      throw new Error(
        'Default keypair not found. Create one with "solana-keygen new" or specify a keypair with --keypair'
      );
    }

    // Read and parse the keypair file
    const keypairString = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
    const keypairData = new Uint8Array(JSON.parse(keypairString));

    return Keypair.fromSecretKey(keypairData);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load default keypair: ${error.message}`);
    }
    throw new Error("Failed to load default keypair");
  }
}

// Helper function to determine RPC URL
function getRpcUrl(options: any): string {
  // First check explicit options
  if (options.url) return options.url;
  if (options.urlDevnet) return DEVNET_URL;
  if (options.urlMainnet) return MAINNET_URL;
  if (options.urlLocal) return LOCALHOST_URL;

  // If no explicit option, try to get from Solana config
  try {
    const configPath = path.join(
      os.homedir(),
      ".config",
      "solana",
      "cli",
      "config.yml"
    );
    console.log("configPath", configPath);
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, "utf8");
      const jsonUrl = config.match(/json_rpc_url: (.+)\n/)?.[1];
      console.log("Using RPC URL from config: " + jsonUrl);
      if (jsonUrl && jsonUrl.indexOf("localhost") > -1) {
        return LOCALHOST_URL;
      }
      if (jsonUrl) {
        return jsonUrl;
      }
    }
  } catch (error) {
    console.warn(
      "Could not read Solana config file, falling back to localhost"
    );
  }

  // Fallback to localhost if nothing else works
  return LOCALHOST_URL;
}

program.parse();
