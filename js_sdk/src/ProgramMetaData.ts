import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { MetadataProgram } from "./types/metadata_program";
import IDL from "./metadata_program.json";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";

const METADATA_OFFSET = 44;
const CHUNK_SIZE = 900;
const MAX_RESIZE_STEP = 10240;
const CONFIRMATION_COMMITMENT: anchor.web3.Commitment = "confirmed";
const DATA_LENGTH_OFFSET = 40;

const METADATA_PROGRAM_ID = new PublicKey(
  "pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA"
);
const IDL_SEED = "idl";
const PROGRAM_METADATA_SEED = "metadata";

interface ConnectionConfig {
  connection: anchor.web3.Connection;
  provider: anchor.AnchorProvider;
  program: anchor.Program<MetadataProgram>;
}

interface ProgramMetaData {
  name: string;
  logo?: string;
  description?: string;
  notification?: string;
  sdk?: string;
  version?: string;
  project_url?: string;
  contacts?: string[];
  policy?: string;
  preferred_languages?: string[];
  encryption?: string;
  source_code?: string;
  source_release?: string;
  source_revision?: string;
  auditors?: string[] | string;
  acknowledgements?: string;
  expiry?: string;
}

class IDLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IDLError";
  }
}

/**
 * Uploads an IDL from a JSON file path
 * @param {string} idlPath - Path to the IDL JSON file
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 * @throws {IDLError} If file not found or upload fails
 */
async function uploadIdlByJsonPath(
  idlPath: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false
) {
  if (!fs.existsSync(idlPath)) {
    throw new IDLError(`File not found: ${idlPath}`);
  }
  if (priorityFeesPerCU < 0) {
    throw new IDLError("Priority fees cannot be negative");
  }
  let buffer: Buffer = fs.readFileSync(idlPath);
  await uploadGenericDataBySeed(
    buffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    IDL_SEED,
    addSignerSeed
  );
}

/**
 * Uploads an IDL URL
 * @param {string} url - URL to upload
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 */
async function uploadIdlUrl(
  url: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false
) {
  let buffer: Buffer = Buffer.from(url, "utf8");
  await uploadGenericDataBySeed(
    buffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    IDL_SEED,
    addSignerSeed
  );
}

/**
 * Uploads generic data using a specified seed
 * @param {Buffer} buffer - Data to upload
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {string} seed - Seed string for PDA derivation
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 */
async function uploadGenericDataBySeed(
  buffer: Buffer,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string,
  addSignerSeed: boolean = false
) {
  const { connection, provider, program } = setupConnection(rpcUrl, keypair);

  const idlAccount = getMetadataAddressBySeed(
    programId,
    seed,
    addSignerSeed ? keypair.publicKey : null
  );
  console.log("Idl pda address", idlAccount.toBase58());

  await initializeMetaDataBySeed(
    idlAccount,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    seed,
    addSignerSeed
  );
  console.log("Initialized Idl account");

  const bufferAddress = await createBuffer(
    buffer,
    keypair,
    rpcUrl,
    priorityFeesPerCU
  );
  if (!bufferAddress) {
    throw new IDLError("Was not able to create buffer");
  }
  console.log("Buffer created");

  await writeBuffer(
    buffer,
    bufferAddress.publicKey,
    keypair,
    rpcUrl,
    priorityFeesPerCU
  );
  console.log("Buffer written");

  await setBuffer(
    bufferAddress.publicKey,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    seed,
    addSignerSeed
  );
  console.log("Buffer set and buffer closed");
}

async function initializeMetaDataBySeed(
  idlPdaAddress: PublicKey,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string,
  addSignerSeed: boolean = false
) {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  const idlAccountInfo = await connection.getAccountInfo(idlPdaAddress);
  if (!idlAccountInfo) {
    // Get the program account to find its loader (owner)
    const programAccountInfo = await connection.getAccountInfo(programId);
    if (!programAccountInfo) {
      throw new IDLError("Program account not found");
    }

    const programLoader = programAccountInfo.owner;
    console.log("Program loader", programLoader.toBase58());

    const [programDataAddress] = await PublicKey.findProgramAddress(
      [programId.toBuffer()],
      programLoader // Use the actual program loader instead of hardcoded one
    );

    console.log("Add signer seed", addSignerSeed);
    console.log("Signer seed", keypair.publicKey.toBase58());
    console.log("Program data address", programDataAddress.toBase58());

    var initializePdaInstruction;
    if (addSignerSeed) {
      initializePdaInstruction = await program.methods
        .initializeWithSignerSeed(seed)
        .accountsPartial({
          idl: idlPdaAddress,
          programId: programId,
          programData: programDataAddress, // Use the actual program data address
        })
        .instruction();
    } else {
      initializePdaInstruction = await program.methods
        .initialize(seed)
        .accountsPartial({
          idl: idlPdaAddress,
          programId: programId,
          programData: programDataAddress, // Use the actual program data address
        })
        .instruction();
    }

    const tx = await createTransaction(
      connection,
      keypair.publicKey,
      priorityFeesPerCU
    );
    tx.add(initializePdaInstruction);
    tx.sign(keypair);
    provider.wallet.signTransaction(tx);

    await withRetry(async () => {
      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(signature);
      console.log("Create IDL PDA signature", signature);
    });
  } else {
    console.log("Idl account already exists");
  }
}

async function setAuthority(
  idlPdaAddress: PublicKey,
  newAuthority: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
) {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  const initializePdaInstruction = await program.methods
    .setAuthority(newAuthority)
    .accountsPartial({
      idl: idlPdaAddress,
      authority: keypair.publicKey,
    })
    .instruction();

  const getLatestBlockhash = await connection.getLatestBlockhash();

  const tx = new anchor.web3.Transaction();
  if (priorityFeesPerCU > 0) {
    const priorityFeeInstruction =
      anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeesPerCU,
      });
    tx.add(priorityFeeInstruction);
  }

  tx.add(initializePdaInstruction);
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);
  provider.wallet.signTransaction(tx);

  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log("Set authority signature", signature);
}

async function createBuffer(
  buffer: Buffer,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
): Promise<Keypair | null> {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  const idlBytes = deflate(new Uint8Array(buffer)); // Compress the IDL JSON
  const bufferSize = idlBytes.length + METADATA_OFFSET; // 44 bytes for discriminator, authority, and data_len
  let bufferKeypair = new Keypair();

  let createAccountInstruction = anchor.web3.SystemProgram.createAccount({
    fromPubkey: keypair.publicKey,
    newAccountPubkey: bufferKeypair.publicKey,
    space: bufferSize,
    lamports: await connection.getMinimumBalanceForRentExemption(bufferSize),
    programId: program.programId,
  });

  const createBufferInstruction = await program.methods
    .createBuffer()
    .accountsPartial({
      buffer: bufferKeypair.publicKey,
    })
    .instruction();

  const getLatestBlockhash = await connection.getLatestBlockhash();

  const tx = new anchor.web3.Transaction();
  if (priorityFeesPerCU > 0) {
    const priorityFeeInstruction =
      anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeesPerCU,
      });
    tx.add(priorityFeeInstruction);
  }
  tx.add(createAccountInstruction);
  tx.add(createBufferInstruction);
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(bufferKeypair);
  provider.wallet.signTransaction(tx);

  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log("Signature", signature);

  console.log("Buffer Address created", bufferKeypair.publicKey.toBase58());

  await connection.confirmTransaction(signature);

  return bufferKeypair;
}

async function writeBuffer(
  buffer: Buffer,
  bufferAddress: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
) {
  const { connection, provider, program } = setupConnection(rpcUrl, keypair);
  const idlBytes = deflate(new Uint8Array(buffer));
  let offset = 0;

  while (offset < idlBytes.length) {
    const chunk = idlBytes.subarray(offset, offset + CHUNK_SIZE);
    const writeBufferInstruction = await program.methods
      .writeBuffer(Buffer.from(chunk))
      .accountsPartial({
        buffer: bufferAddress,
      })
      .instruction();

    const tx = await createTransaction(
      connection,
      keypair.publicKey,
      priorityFeesPerCU
    );
    tx.add(writeBufferInstruction);
    tx.sign(keypair);
    provider.wallet.signTransaction(tx);

    await withRetry(async () => {
      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(signature);
      console.log("Write data chunk: ", signature);
    });

    offset += CHUNK_SIZE;
  }
  console.log("Write buffer was successfully!");
}

async function setBuffer(
  bufferAddress: PublicKey,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string,
  addSignerSeed: boolean = false
) {
  const { connection, provider, program } = setupConnection(rpcUrl, keypair);

  const idlAccount = getMetadataAddressBySeed(
    programId,
    seed,
    addSignerSeed ? keypair.publicKey : null
  );

  const idlAccountAccountInfo = await connection.getAccountInfo(idlAccount);
  if (!idlAccountAccountInfo) {
    throw new IDLError("IDL account not found");
  }
  const bufferAccountAccountInfo = await connection.getAccountInfo(
    bufferAddress
  );

  if (!bufferAccountAccountInfo) {
    throw new IDLError("Buffer account not found");
  }

  let idlAccountSize = idlAccountAccountInfo.data.length;
  const bufferAccountSize = bufferAccountAccountInfo.data.length;
  console.log(
    `IDL account size ${idlAccountSize} Buffer account size ${bufferAccountSize}`
  );

  const tx = await createTransaction(
    connection,
    keypair.publicKey,
    priorityFeesPerCU
  );

  // Add resize instructions
  if (bufferAccountSize < idlAccountSize) {
    const resizeInstruction = await program.methods
      .resize(bufferAccountSize, seed)
      .accountsPartial({
        idl: idlAccount,
        programId: programId,
      })
      .instruction();
    tx.add(resizeInstruction);
    console.log("Resizing IDL account to: ", bufferAccountSize);
  } else {
    let leftOverToResize = Math.max(0, bufferAccountSize - idlAccountSize);

    while (leftOverToResize > 0) {
      // Determine the chunk size for this resize step (max 10KB per step)
      const chunkSize = Math.min(MAX_RESIZE_STEP, leftOverToResize);
      idlAccountSize += chunkSize;
      const resizeInstruction = await program.methods
        .resize(idlAccountSize, seed)
        .accountsPartial({
          idl: idlAccount,
          programId: programId,
        })
        .instruction();

      tx.add(resizeInstruction);
      console.log(`Resize to ${chunkSize} left over ${leftOverToResize}`);

      // Subtract the chunk size from the remaining size to resize
      leftOverToResize -= chunkSize;
    }
  }

  const setBufferInstruction = await program.methods
    .setBuffer(seed)
    .accountsPartial({
      idl: idlAccount,
      buffer: bufferAddress,
      programId: programId,
    })
    .instruction();

  tx.add(setBufferInstruction);

  const closeBufferInstruction = await program.methods
    .closeBuffer()
    .accountsPartial({
      buffer: bufferAddress,
    })
    .instruction();

  tx.add(closeBufferInstruction);

  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Signature set buffer", signature);
  });
}

function getAssociatedIdlAddress(programId: PublicKey): PublicKey {
  return getMetadataAddressBySeed(programId, IDL_SEED, null);
}

function getAssociatedMetadataIdlAddress(programId: PublicKey): PublicKey {
  return getMetadataAddressBySeed(programId, PROGRAM_METADATA_SEED, null);
}

/**
 * Gets the associated PDA address for IDL data
 * @param {PublicKey} programId - Program ID
 * @param {string} seed - Seed string for PDA derivation
 * @param {PublicKey} signerSeed - Optional signer public key to use as additional seed
 * @returns {PublicKey} The derived PDA address
 */
function getMetadataAddressBySeed(
  programId: PublicKey,
  seed: string,
  signerSeed?: PublicKey
): PublicKey {
  const seeds = [Buffer.from(seed, "utf8"), programId.toBuffer()];

  if (signerSeed) {
    seeds.push(signerSeed.toBuffer());
  }

  const [idlAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    seeds,
    new PublicKey(METADATA_PROGRAM_ID)
  );
  return idlAccount;
}

async function fetchIDL(
  programId: PublicKey,
  rpcUrl: string,
  signerSeed?: PublicKey
): Promise<string | null> {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

  const idlAccount = getMetadataAddressBySeed(programId, IDL_SEED, signerSeed);
  const accountInfo = await connection.getAccountInfo(idlAccount);

  // If we get the IDL account we can not access the additional data bytes at
  // the end so we need to use getaccount info and manually cut of the front.
  // const idl = await program.account.idlAccount.fetch(idlAccount);
  // console.log("IDL", idl); We could also use the account info to get the IDL
  // but that would be two calls.

  if (!accountInfo) {
    throw new Error(`IDL account not found at ${idlAccount.toBase58()}`);
  }

  // In the account we have the anchor descriminator 8 + authority 32 + data_len 4 + data
  const dataLenBytes = accountInfo.data.slice(
    METADATA_OFFSET - 4,
    METADATA_OFFSET
  ); // `data_len` starts at offset 40
  const dataLength = new DataView(dataLenBytes.buffer).getUint32(0, true); // Little-endian

  const compressedData = accountInfo.data.slice(
    METADATA_OFFSET,
    METADATA_OFFSET + dataLength
  ); // Skip metadata (44 bytes)

  // Decompress the data
  const decompressedData = inflate(compressedData);

  // Convert Uint8Array to string
  const idlString = new TextDecoder("utf-8").decode(decompressedData);
  // Check if the idlString is a URL
  try {
    const url = new URL(idlString);
    // If it's a valid URL, fetch the IDL from it
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch IDL from URL: ${response.statusText}`);
    }
    const idlFromUrl = await response.text();
    // Validate that the fetched IDL is valid JSON
    try {
      JSON.parse(idlFromUrl);
    } catch (error) {
      throw new Error(`Invalid IDL JSON format from URL: ${error}`);
    }
    return idlFromUrl;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Invalid URL")) {
      // If not a URL, validate the original IDL string as JSON
      try {
        JSON.parse(idlString);
      } catch (error) {
        throw new Error(`Invalid IDL JSON format: ${error}`);
      }
      return idlString;
    }
    throw error;
  }
}

function setupConnection(rpcUrl: string, keypair: Keypair): ConnectionConfig {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  return { connection, provider, program };
}

async function createTransaction(
  connection: anchor.web3.Connection,
  feePayer: PublicKey,
  priorityFeesPerCU: number
): Promise<anchor.web3.Transaction> {
  const tx = new anchor.web3.Transaction();
  if (priorityFeesPerCU > 0) {
    const priorityFeeInstruction =
      anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeesPerCU,
      });
    tx.add(priorityFeeInstruction);
  }

  const getLatestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = feePayer;

  return tx;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Uploads program metadata
 * @param {ProgramMetaData} metadata - Program metadata object
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 */
async function uploadProgramMetadata(
  metadata: ProgramMetaData,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false
) {
  // Validate required fields
  if (!metadata.name) {
    throw new IDLError("Missing required metadata fields");
  }

  // Validate date format if expiry is provided
  if (metadata.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.expiry)) {
    throw new IDLError("Expiry date must be in YYYY-MM-DD format");
  }

  // Convert metadata to buffer
  const metadataBuffer = Buffer.from(JSON.stringify(metadata), "utf8");

  // Upload using existing metadata upload function with "metadata" seed
  await uploadGenericDataBySeed(
    metadataBuffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    PROGRAM_METADATA_SEED,
    addSignerSeed
  );
}

/**
 * Fetches program metadata
 * @param {PublicKey} programId - Program ID
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {PublicKey} signerSeed - Optional signer public key to use as additional seed
 * @returns {Promise<ProgramMetaData>} The program metadata
 */
async function fetchProgramMetadata(
  programId: PublicKey,
  rpcUrl: string,
  signerSeed?: PublicKey
): Promise<ProgramMetaData> {
  const connection = new anchor.web3.Connection(
    rpcUrl,
    CONFIRMATION_COMMITMENT
  );

  const metadataAccount = getMetadataAddressBySeed(
    programId,
    PROGRAM_METADATA_SEED,
    signerSeed
  );
  const accountInfo = await connection.getAccountInfo(metadataAccount);

  if (!accountInfo) {
    throw new IDLError(
      `Metadata not found for program ${programId.toBase58()}`
    );
  }

  const dataLenBytes = accountInfo.data.slice(
    DATA_LENGTH_OFFSET,
    METADATA_OFFSET
  );
  const dataLength = new DataView(dataLenBytes.buffer).getUint32(0, true);

  const compressedData = accountInfo.data.slice(
    METADATA_OFFSET,
    METADATA_OFFSET + dataLength
  );

  const decompressedData = inflate(compressedData);
  const metadataString = new TextDecoder("utf-8").decode(decompressedData);

  try {
    console.log("Metadata string", metadataString);

    return JSON.parse(metadataString) as ProgramMetaData;
  } catch (error) {
    // If metadata can't be parsed, try treating it as a URL and fetch from there
    try {
      const response = await fetch(metadataString.trim());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();
      return jsonData as ProgramMetaData;
    } catch (fetchError) {
      console.error("Failed to fetch metadata from URL:", fetchError);
    }
    throw new IDLError("Failed to parse program metadata");
  }
}

/**
 * Uploads program metadata from a JSON file
 * @param {string} metadataPath - Path to metadata JSON file
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 * @throws {IDLError} If file not found or upload fails
 */
async function uploadProgramMetadataByJsonPath(
  metadataPath: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false
) {
  if (!fs.existsSync(metadataPath)) {
    throw new IDLError(`File not found: ${metadataPath}`);
  }
  if (priorityFeesPerCU < 0) {
    throw new IDLError("Priority fees cannot be negative");
  }

  const fileContent = fs.readFileSync(metadataPath, "utf8");
  let metadata: ProgramMetaData;
  try {
    metadata = JSON.parse(fileContent) as ProgramMetaData;
  } catch (error) {
    throw new IDLError("Invalid JSON format in metadata file");
  }

  await uploadProgramMetadata(
    metadata,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    addSignerSeed
  );
}

/**
 * Uploads program metadata from a URL
 * @param {string} url - URL pointing to metadata JSON
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @param {boolean} addSignerSeed - Whether to add signer's public key as additional seed (optional, defaults to false)
 * @throws {IDLError} If URL fetch fails or metadata is invalid
 */
async function uploadProgramMetadataByUrl(
  url: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false
) {
  try {
    // Check that the URL is actually a metadata json
    // If you want to upload some generic data use uploadGenericDataBySeed instead
    const response = await fetch(url);
    if (!response.ok) {
      throw new IDLError(
        `Failed to fetch metadata from URL: ${response.statusText}`
      );
    }
    const metadata = (await response.json()) as ProgramMetaData;

    // Validate required fields
    if (!metadata.name) {
      throw new IDLError("Missing required metadata fields");
    }

    // Validate date format if expiry is provided
    if (metadata.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.expiry)) {
      throw new IDLError("Expiry date must be in YYYY-MM-DD format");
    }

    // Convert metadata to buffer
    const metadataUrlBuffer = Buffer.from(url.toString(), "utf8");
    await uploadGenericDataBySeed(
      metadataUrlBuffer,
      programId,
      keypair,
      rpcUrl,
      priorityFeesPerCU,
      PROGRAM_METADATA_SEED,
      addSignerSeed
    );
  } catch (error) {
    if (error instanceof IDLError) {
      throw error;
    }
    // Type guard for Error objects
    if (error instanceof Error) {
      throw new IDLError(`Failed to process metadata from URL: ${error}`);
    }
    // Fallback for unknown error types
    throw new IDLError("Failed to process metadata from URL: Unknown error");
  }
}

export {
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByJsonPath,
  uploadProgramMetadataByUrl,
  setAuthority,
  fetchIDL,
  getAssociatedIdlAddress,
  getAssociatedMetadataIdlAddress,
  getMetadataAddressBySeed,
  uploadGenericDataBySeed,
  setupConnection,
  uploadProgramMetadata,
  fetchProgramMetadata,
  ProgramMetaData,
};
