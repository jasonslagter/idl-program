#!/usr/bin/env node

import { Command } from "commander";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  uploadProgramMetadataByJsonPath,
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByUrl,
} from "./ProgramMetaData";
import fs from "fs";
import * as anchor from "@coral-xyz/anchor";

const program = new Command();
const DEFAULT_RPC_URL = "";

program
  .name("program-metadata")
  .description("CLI to manage Solana program metadata and IDL")
  .version("0.0.13");

async function validateConnection(url: string): Promise<boolean> {
  const connection = new anchor.web3.Connection(url, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: url.replace("http", "ws"),
  });

  try {
    console.log("Checking connection to:", url);
    const version = await connection.getVersion();
    console.log("Solana version:", version["solana-core"]);
    return true;
  } catch (e) {
    console.error("Connection error:", e.message);
    return false;
  }
}

program
  .command("uploadMetadata")
  .description("Upload program metadata from a JSON file")
  .requiredOption(
    "-k, --keypair <path>",
    "Keypair file path (Needs to be the programs upgrade authority) "
  )
  .requiredOption("-j, --jsonPath <path>", "Metadata JSON file path")
  .requiredOption("-p, --programId <address>", "Program ID")
  .option("-u, --url <string>", "RPC URL", DEFAULT_RPC_URL)
  .option("-f, --fees <number>", "Priority fees per compute unit", "0")
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, "utf-8"));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);

      console.log("Metadata upload started!!");

      await uploadProgramMetadataByJsonPath(
        options.jsonPath,
        programId,
        keypair,
        options.url,
        parseInt(options.fees)
      );

      console.log("Metadata uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("uploadIdl")
  .description("Upload program IDL from a JSON file")
  .requiredOption(
    "-k, --keypair <path>",
    "Keypair file path (Needs to be the programs upgrade authority)  (Needs to be the programs authority) "
  )
  .requiredOption("-j, --jsonPath <path>", "IDL JSON file path")
  .requiredOption("-p, --programId <address>", "Program ID")
  .option("-u, --url <string>", "RPC URL", DEFAULT_RPC_URL)
  .option("-f, --fees <number>", "Priority fees per compute unit", "0")
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, "utf-8"));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);

      await uploadIdlByJsonPath(
        options.jsonPath,
        programId,
        keypair,
        options.url,
        parseInt(options.fees)
      );

      console.log("IDL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("uploadMetadataUrl")
  .description("Upload program metadata from a URL")
  .requiredOption(
    "-k, --keypair <path>",
    "Keypair file path (Needs to be the programs upgrade authority) "
  )
  .requiredOption("-j, --url <url>", "Metadata JSON URL")
  .requiredOption("-p, --programId <address>", "Program ID")
  .option("-u, --rpcUrl <string>", "RPC URL", DEFAULT_RPC_URL)
  .option("-f, --fees <number>", "Priority fees per compute unit", "0")
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, "utf-8"));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);

      console.log("Metadata URL upload started!!");

      await uploadProgramMetadataByUrl(
        options.url,
        programId,
        keypair,
        options.rpcUrl,
        parseInt(options.fees)
      );

      console.log("Metadata URL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("uploadIdlUrl")
  .description("Upload IDL URL")
  .requiredOption(
    "-k, --keypair <path>",
    "Keypair file path (Needs to be the programs upgrade authority) "
  )
  .requiredOption("-j, --url <url>", "IDL URL")
  .requiredOption("-p, --programId <address>", "Program ID")
  .option("-u, --rpcUrl <string>", "RPC URL", DEFAULT_RPC_URL)
  .option("-f, --fees <number>", "Priority fees per compute unit", "0")
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, "utf-8"));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);

      console.log("IDL URL upload started!!");

      await uploadIdlUrl(
        options.url,
        programId,
        keypair,
        options.rpcUrl,
        parseInt(options.fees)
      );

      console.log("IDL URL uploaded successfully!");
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });


program.parse();
