import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { UploadIdlAnchor } from "./types/upload_idl_anchor";
import IDL from "./upload_idl_anchor.json";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";

const METADATA_OFFSET = 44;
const CHUNK_SIZE = 900;
const MAX_RESIZE_STEP = 10240;
const CONFIRMATION_COMMITMENT: anchor.web3.Commitment = "confirmed";
const DATA_LENGTH_OFFSET = 40;

const BPF_LOADER_2_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
const IDL_PROGRAM_ID = new PublicKey(
  "idLB41CuMPpWZmQGGxpsxbyGDWWzono4JnFLJxQakrE"
);
const IDL_SEED = "idl";
const PROGRAM_METADATA_SEED = "metadata";

interface TransactionConfig {
  keypair: Keypair;
  rpcUrl: string;
  priorityFeesPerCU: number;
}

interface ConnectionConfig {
  connection: anchor.web3.Connection;
  provider: anchor.AnchorProvider;
  program: anchor.Program<UploadIdlAnchor>;
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
 * @throws {IDLError} If file not found or upload fails
 */
async function uploadIdlByJsonPath(
  idlPath: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
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
    IDL_SEED
  );
}

async function uploadIdlUrl(
  url: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
) {
  let buffer: Buffer = Buffer.from(url, "utf8");
  await uploadGenericDataBySeed(
    buffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    IDL_SEED
  );
}

async function uploadGenericDataBySeed(
  buffer: Buffer,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string
) {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);

  const idlAccount = getCanonicalPdaAddressBySeed(programId, seed);
  console.log("Idl pda address", idlAccount.toBase58());
  await initializeMetaDataBySeed(
    idlAccount,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    seed
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
    seed
  );
  console.log("Buffer set and buffer closed");
}

async function initializeMetaDataBySeed(
  idlPdaAddress: PublicKey,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string
) {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

  const idlAccountInfo = await connection.getAccountInfo(idlPdaAddress);
  if (!idlAccountInfo) {
    const [programDataAddress] = await PublicKey.findProgramAddress(
      [programId.toBuffer()],
      BPF_LOADER_2_PROGRAM_ID
    );

    const initializePdaInstruction = await program.methods
      .initialize(seed)
      .accountsPartial({
        idl: idlPdaAddress,
        programId: programId,
        programData: programDataAddress,
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
    console.log("Create IDL PDA signature", signature);
    console.log("Idl account created", keypair.publicKey.toBase58());

    await connection.confirmTransaction(signature);
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
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

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
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

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
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

  const idlBytes = deflate(new Uint8Array(buffer)); // Compress the buffer

  let offset = 0;

  while (offset < idlBytes.length) {
    const chunk = idlBytes.subarray(offset, offset + CHUNK_SIZE); // Use subarray for Uint8Array

    const writeBufferInstruction = await program.methods
      .writeBuffer(Buffer.from(chunk))
      .accountsPartial({
        buffer: bufferAddress,
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
    tx.add(writeBufferInstruction);
    tx.recentBlockhash = getLatestBlockhash.blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    provider.wallet.signTransaction(tx);

    const signature = await connection.sendRawTransaction(tx.serialize());
    console.log("Write data chunk: ", signature);

    await connection.confirmTransaction(signature);

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
  seed: string
) {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

  const idlAccount = getCanonicalPdaAddressBySeed(programId, seed);

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

  const tx = new anchor.web3.Transaction();

  console.log(
    `IDL account size ${idlAccountSize} Buffer account size ${bufferAccountSize}`
  );

  if (priorityFeesPerCU > 0) {
    const priorityFeeInstruction =
      anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeesPerCU,
      });
    tx.add(priorityFeeInstruction);
  }

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

  const getLatestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = keypair.publicKey;
  provider.wallet.signTransaction(tx);

  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(signature, "confirmed");
  console.log("Signature set buffer", signature);
}

function getCanonicalIdlAddress(programId: PublicKey): PublicKey {
  return getCanonicalPdaAddressBySeed(programId, IDL_SEED);
}

function getCanonicalPdaAddressBySeed(
  programId: PublicKey,
  seed: string
): PublicKey {
  const [idlAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(seed, "utf8"), programId.toBuffer()],
    new PublicKey(IDL_PROGRAM_ID)
  );
  return idlAccount;
}

async function fetchIDL(
  programId: PublicKey,
  rpcUrl: string
): Promise<string | null> {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

  const idlAccount = getCanonicalPdaAddressBySeed(programId, IDL_SEED);
  const accountInfo = await connection.getAccountInfo(idlAccount);

  // If we get the IDL account we can not access the additional data bytes at
  // the end so we need to use getaccount info and manually cut of the front.
  // const idl = await program.account.idlAccount.fetch(idlAccount);
  // console.log("IDL", idl);

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

  return idlString;
}

function setupConnection(rpcUrl: string, keypair: Keypair): ConnectionConfig {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as UploadIdlAnchor, provider);

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
 * Uploads program metadata for a program
 * @param {ProgramMetaData} metadata - Program metadata object
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 */
async function uploadProgramMetadata(
  metadata: ProgramMetaData,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
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
    PROGRAM_METADATA_SEED
  );
}

/**
 * Fetches program metadata for a program
 * @param {PublicKey} programId - Program ID
 * @param {string} rpcUrl - RPC URL for the connection
 * @returns {Promise<ProgramMetaData>} The program metadata
 */
async function fetchProgramMetadata(
  programId: PublicKey,
  rpcUrl: string
): Promise<ProgramMetaData> {
  const connection = new anchor.web3.Connection(
    rpcUrl,
    CONFIRMATION_COMMITMENT
  );

  const metadataAccount = getCanonicalPdaAddressBySeed(
    programId,
    PROGRAM_METADATA_SEED
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
    return JSON.parse(metadataString) as ProgramMetaData;
  } catch (error) {
    throw new IDLError("Failed to parse program metadata");
  }
}

/**
 * Uploads program metadata from a JSON file path
 * @param {string} metadataPath - Path to the metadata JSON file
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 * @throws {IDLError} If file not found or upload fails
 */
async function uploadProgramMetadataByJsonPath(
  metadataPath: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
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
    priorityFeesPerCU
  );
}

/**
 * Uploads program metadata from a URL
 * @param {string} url - URL pointing to the metadata JSON
 * @param {PublicKey} programId - Program ID
 * @param {Keypair} keypair - Keypair for transaction signing
 * @param {string} rpcUrl - RPC URL for the connection
 * @param {number} priorityFeesPerCU - Priority fees per compute unit
 */
async function uploadProgramMetadataByUrl(
  url: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number
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
    const metadataUrlBuffer = Buffer.from(url, "utf8");

    await uploadGenericDataBySeed(
      metadataUrlBuffer,
      programId,
      keypair,
      rpcUrl,
      priorityFeesPerCU,
      PROGRAM_METADATA_SEED
    );
  } catch (error) {
    if (error instanceof IDLError) {
      throw error;
    }
    // Type guard for Error objects
    if (error instanceof Error) {
      throw new IDLError(
        `Failed to process metadata from URL: ${error.message}`
      );
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
  getCanonicalIdlAddress,
  getCanonicalPdaAddressBySeed,
  uploadGenericDataBySeed,
  setupConnection,
  uploadProgramMetadata,
  fetchProgramMetadata,
  ProgramMetaData,
};
