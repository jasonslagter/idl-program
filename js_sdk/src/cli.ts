#!/usr/bin/env node

import { Command } from "commander";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  uploadProgramMetadataByJsonPath,
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByUrl,
  fetchIDL,
  fetchProgramMetadata,
} from "./ProgramMetaData";
import fs from "fs";
import os from "os";
import path from "path";

const program = new Command();

program
  .name("program-metadata")
  .description("CLI to manage Solana program metadata and IDL")
  .version("0.0.13");

// IDL Commands
const idlCommand = program
  .command("idl")
  .description("IDL management commands");

idlCommand
  .command("upload <file> <program-id>")
  .description("Upload IDL from a file")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-p, --priority-fees <number>", "Priority fees per compute unit", "0")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (file, programId, options) => {
    try {
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      await uploadIdlByJsonPath(
        file,
        new PublicKey(programId),
        keypair,
        options.url,
        parseInt(options.priorityFees)
      );
      console.log("IDL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

idlCommand
  .command("upload-url <url> <program-id>")
  .description("Upload IDL from URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-p, --priority-fees <number>", "Priority fees per compute unit", "0")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (url, programId, options) => {
    try {
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      await uploadIdlUrl(
        url,
        new PublicKey(programId),
        keypair,
        options.url,
        parseInt(options.priorityFees)
      );
      console.log("IDL URL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

idlCommand
  .command("download <program-id> [output]")
  .description("Download IDL to file")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (programId, output = "idl.json", options) => {
    try {
      const idl = await fetchIDL(new PublicKey(programId), options.url);
      fs.writeFileSync(output, idl);
      console.log(`IDL downloaded to ${output}`);
    } catch (error) {
      console.error("Error:", error.message);
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
  .option("-p, --priority-fees <number>", "Priority fees per compute unit", "0")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (file, programId, options) => {
    try {
      console.log("options.keypair", options.keypair);
      const keypairString = fs.readFileSync(options.keypair, "utf-8");
      const keypairData = new Uint8Array(JSON.parse(keypairString));
      console.log("Keypair data", keypairData);

      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      await uploadProgramMetadataByJsonPath(
        file,
        new PublicKey(programId),
        keypair,
        options.url,
        parseInt(options.priorityFees)
      );
      console.log("Metadata uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

metadataCommand
  .command("upload-url <url> <program-id>")
  .description("Upload metadata from URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-p, --priority-fees <number>", "Priority fees per compute unit", "0")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (url, programId, options) => {
    try {
      const keypair = options.keypair
        ? Keypair.fromSecretKey(
            new Uint8Array(
              JSON.parse(fs.readFileSync(options.keypair, "utf-8"))
            )
          )
        : loadDefaultKeypair();

      await uploadProgramMetadataByUrl(
        url,
        new PublicKey(programId),
        keypair,
        options.url,
        parseInt(options.priorityFees)
      );
      console.log("Metadata URL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

metadataCommand
  .command("download <program-id> [output]")
  .description("Download metadata to file")
  .option("-u, --url <string>", "RPC URL", "http://127.0.0.1:8899")
  .action(async (programId, output = "metadata.json", options) => {
    try {
      const metadata = await fetchProgramMetadata(
        new PublicKey(programId),
        options.url
      );
      fs.writeFileSync(output, JSON.stringify(metadata, null, 2));
      console.log(`Metadata downloaded to ${output}`);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

// Helper function to load default keypair (you'll need to implement this)
function loadDefaultKeypair(): Keypair {
  throw new Error("Default keypair loading not implemented");
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

program.parse();
