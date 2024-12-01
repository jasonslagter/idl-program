#!/usr/bin/env node

import { Command } from 'commander';
import { Keypair, PublicKey } from '@solana/web3.js';
import { uploadProgramMetadataByJsonPath, uploadIdlByJsonPath } from './ProgramMetaData';
import fs from 'fs';

const program = new Command();

program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDL')
  .version('0.0.7');

program
  .command('uploadMetadata')
  .description('Upload program metadata from a JSON file')
  .requiredOption('-k, --keypair <path>', 'Keypair file path')
  .requiredOption('-j, --jsonPath <path>', 'Metadata JSON file path')
  .requiredOption('-p, --programId <address>', 'Program ID')
  .option('-u, --url <string>', 'RPC URL', 'http://localhost:8899')
  .option('-f, --fees <number>', 'Priority fees per compute unit', '0')
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);
      
      await uploadProgramMetadataByJsonPath(
        options.jsonPath,
        programId,
        keypair,
        options.url,
        parseInt(options.fees)
      );
      
      console.log('Metadata uploaded successfully!');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('uploadIdl')
  .description('Upload program IDL from a JSON file')
  .requiredOption('-k, --keypair <path>', 'Keypair file path')
  .requiredOption('-j, --jsonPath <path>', 'IDL JSON file path')
  .requiredOption('-p, --programId <address>', 'Program ID')
  .option('-u, --url <string>', 'RPC URL', 'http://localhost:8899')
  .option('-f, --fees <number>', 'Priority fees per compute unit', '0')
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(fs.readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      const programId = new PublicKey(options.programId);
      
      await uploadIdlByJsonPath(
        options.jsonPath,
        programId,
        keypair,
        options.url,
        parseInt(options.fees)
      );
      
      console.log('IDL uploaded successfully!');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse(); 