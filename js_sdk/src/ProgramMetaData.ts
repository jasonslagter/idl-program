import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { MetadataProgram } from "./types/metadata_program";
import IDL from "./metadata_program.json";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { decodeUpgradeableLoaderState } from "@coral-xyz/anchor/dist/cjs/utils/registry";

const CHUNK_SIZE = 900;
const MAX_RESIZE_STEP = 10240;
const CONFIRMATION_COMMITMENT: anchor.web3.Commitment = "confirmed";

const METADATA_PROGRAM_ID = new PublicKey(
  "pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA"
);
const IDL_SEED = "idl";
const PROGRAM_METADATA_SEED = "metadata";

// Helper to get constant value from IDL
function getConstant(name: string): string {
  const constant = IDL.constants.find((c) => c.name === name);
  if (!constant) {
    throw new IDLError(`Required constant ${name} not found in IDL`);
  }
  return constant.value.replace(/"/g, "");
}

// Get constants from IDL
export const DATA_TYPE_IDL_JSON = getConstant("DATA_TYPE_IDL_JSON");
export const DATA_TYPE_IDL_URL = getConstant("DATA_TYPE_IDL_URL");
export const DATA_TYPE_META_JSON = getConstant("DATA_TYPE_META_JSON");
export const DATA_TYPE_META_URL = getConstant("DATA_TYPE_META_URL");
export const METADATA_OFFSET = Number(getConstant("METADATA_ACCOUNT_SIZE"));
export const DATA_TYPE_LENGTH = Number(getConstant("DATA_TYPE_LENGTH"));

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
  addSignerSeed: boolean = false,
  exportOnly: boolean
): Promise<void | ExportedTransaction> {
  if (!fs.existsSync(idlPath)) {
    throw new IDLError(`File not found: ${idlPath}`);
  }
  if (priorityFeesPerCU < 0) {
    throw new IDLError("Priority fees cannot be negative");
  }
  let buffer: Buffer = fs.readFileSync(idlPath);
  return await uploadGenericDataBySeed(
    buffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    IDL_SEED,
    addSignerSeed,
    DATA_TYPE_IDL_JSON,
    exportOnly
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
  addSignerSeed: boolean = false,
  exportOnly: boolean
): Promise<void | ExportedTransaction> {
  let buffer: Buffer = Buffer.from(url, "utf8");
  return await uploadGenericDataBySeed(
    buffer,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    IDL_SEED,
    addSignerSeed,
    DATA_TYPE_IDL_URL,
    exportOnly
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
  addSignerSeed: boolean = false,
  dataType: string,
  exportOnly: boolean
): Promise<void | ExportedTransaction> {
  if (dataType.length > DATA_TYPE_LENGTH) {
    throw new IDLError(
      `Data type too long, max length is ${DATA_TYPE_LENGTH} bytes`
    );
  }
  const metadataAccount = getMetadataAddressBySeed(
    programId,
    seed,
    addSignerSeed ? keypair.publicKey : undefined
  );
  console.log("Metadata PDA address", metadataAccount.toBase58());

  // Create buffer and wait for confirmation
  const bufferAddress = await createBuffer(
    buffer,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    dataType
  );
  if (!bufferAddress) {
    throw new IDLError("Was not able to create buffer");
  }
  console.log("Buffer created");

  // Write buffer and wait for confirmation
  await writeBuffer(
    buffer,
    bufferAddress.publicKey,
    keypair,
    rpcUrl,
    priorityFeesPerCU
  );
  console.log("Buffer written");

  // Set buffer (which will also initialize if needed) and wait for confirmation
  var result = await setBuffer(
    bufferAddress.publicKey,
    programId,
    keypair,
    rpcUrl,
    priorityFeesPerCU,
    seed,
    addSignerSeed,
    dataType,
    exportOnly
  );
  if (!exportOnly) {
    console.log("Buffer set and buffer closed");
  }
  return result;
}

async function setAuthority(
  metadataPdaAddress: PublicKey,
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

  const setAuthorityInstruction = await program.methods
    .setAuthority(newAuthority)
    .accountsPartial({
      pda: metadataPdaAddress,
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

  tx.add(setAuthorityInstruction);
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = keypair.publicKey;
  console.log(
    "Serialised transaction for multisig",
    bs58.encode(tx.compileMessage().serialize())
  );
  tx.sign(keypair);
  provider.wallet.signTransaction(tx);

  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log("Set authority signature", signature);
}

async function createBuffer(
  buffer: Buffer,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  dataType: string
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
  const bufferSize = idlBytes.length + METADATA_OFFSET;
  let bufferKeypair = new Keypair();

  let createAccountInstruction = anchor.web3.SystemProgram.createAccount({
    fromPubkey: keypair.publicKey,
    newAccountPubkey: bufferKeypair.publicKey,
    space: bufferSize,
    lamports: await connection.getMinimumBalanceForRentExemption(bufferSize),
    programId: program.programId,
  });

  const createBufferInstruction = await program.methods
    .createBuffer(dataType)
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

interface ExportedTransaction {
  base58: string;
  base64: string;
}

async function setBuffer(
  bufferAddress: PublicKey,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string,
  addSignerSeed: boolean = false,
  dataType: string,
  exportOnly: boolean
): Promise<void | ExportedTransaction> {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    {}
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  // Get program data address
  const programAccountInfo = await connection.getAccountInfo(programId);
  if (!programAccountInfo) {
    throw new Error("Program account not found");
  }
  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    programAccountInfo.owner
  );

  const metadataAccount = getMetadataAddressBySeed(
    programId,
    seed,
    addSignerSeed ? keypair.publicKey : undefined
  );

  // If exporting, get program authority
  let authority = keypair.publicKey;
  if (exportOnly) {
    const programDataInfo = await connection.getAccountInfo(programDataAddress);
    if (!programDataInfo) {
      throw new Error("Program data account not found");
    }
    const decoded = decodeUpgradeableLoaderState(programDataInfo.data);
    if (decoded.programData.upgradeAuthorityAddress) {
      authority = new PublicKey(decoded.programData.upgradeAuthorityAddress);
    } else {
      throw new Error("Program has no authority");
    }
  }

  const tx = await createTransaction(connection, authority, priorityFeesPerCU);

  // Get buffer size first
  const bufferAccountInfo = await connection.getAccountInfo(bufferAddress);
  if (!bufferAccountInfo) {
    throw new IDLError("Buffer account not found");
  }
  const bufferAccountSize = bufferAccountInfo.data.length;

  // Check if we need to initialize
  const initInstruction = await getInitializeInstruction(
    metadataAccount,
    programId,
    seed,
    addSignerSeed,
    dataType,
    provider
  );

  const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);

  if (initInstruction) {
    tx.add(initInstruction);

    // Always resize after initialization
    let leftOverToResize = bufferAccountSize;
    while (leftOverToResize > 0) {
      const chunkSize = Math.min(MAX_RESIZE_STEP, leftOverToResize);
      const resizeInstruction = await program.methods
        .resize(chunkSize)
        .accountsPartial({
          pda: metadataAccount,
          programId: programId,
        })
        .instruction();

      tx.add(resizeInstruction);
      leftOverToResize -= chunkSize;
    }
  } else if (metadataAccountInfo) {
    // Handle resize for existing accounts
    let metadataAccountSize = metadataAccountInfo.data.length;

    if (bufferAccountSize < metadataAccountSize) {
      const resizeInstruction = await program.methods
        .resize(bufferAccountSize)
        .accountsPartial({
          pda: metadataAccount,
          programId: programId,
        })
        .instruction();
      tx.add(resizeInstruction);
    } else if (bufferAccountSize > metadataAccountSize) {
      let leftOverToResize = bufferAccountSize - metadataAccountSize;
      while (leftOverToResize > 0) {
        const chunkSize = Math.min(MAX_RESIZE_STEP, leftOverToResize);
        metadataAccountSize += chunkSize;
        const resizeInstruction = await program.methods
          .resize(metadataAccountSize)
          .accountsPartial({
            pda: metadataAccount,
            programId: programId,
          })
          .instruction();

        tx.add(resizeInstruction);
        console.log(`Resize to ${chunkSize} left over ${leftOverToResize}`);
        leftOverToResize -= chunkSize;
      }
    }
  }

  const setBufferInstruction = await program.methods
    .setBuffer()
    .accountsPartial({
      pda: metadataAccount,
      buffer: bufferAddress,
      authority: authority,
      programId: programId,
      programData: programDataAddress,
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

  if (exportOnly) {
    return {
      base58: bs58.encode(tx.compileMessage().serialize()),
      base64: Buffer.from(tx.compileMessage().serialize()).toString("base64"),
    };
  }

  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Set buffer signature", signature);
  });
}

function getAssociatedIdlAddress(programId: PublicKey): PublicKey {
  return getMetadataAddressBySeed(programId, IDL_SEED);
}

function getAssociatedMetadataAddress(programId: PublicKey): PublicKey {
  return getMetadataAddressBySeed(programId, PROGRAM_METADATA_SEED);
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
  const seeds = [programId.toBuffer(), Buffer.from(seed, "utf8")];

  if (signerSeed) {
    seeds.splice(1, 0, signerSeed.toBuffer());
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
  // We could also use the idlAccount.fetch to get the IDL account but that would be two calls

  if (!accountInfo) {
    throw new Error(`IDL account not found at ${idlAccount.toBase58()}`);
  }

  // Get the data type from the account (it's stored after the discriminator and authority)
  const dataType = new TextDecoder().decode(
    accountInfo.data.slice(40, 40 + DATA_TYPE_LENGTH).filter((x) => x !== 0)
  );

  console.log("Data type", dataType);

  const dataLenBytes = accountInfo.data.slice(
    METADATA_OFFSET - 4,
    METADATA_OFFSET
  );
  const dataLength = new DataView(
    dataLenBytes.buffer,
    dataLenBytes.byteOffset,
    dataLenBytes.byteLength
  ).getUint32(0, true); // true for little-endian

  console.log("dataLength", dataLength);

  const compressedData = accountInfo.data.slice(
    METADATA_OFFSET,
    METADATA_OFFSET + dataLength
  );
  const decompressedData = inflate(compressedData);
  const content = new TextDecoder("utf-8").decode(decompressedData);

  if (dataType === DATA_TYPE_IDL_URL) {
    // Handle URL type
    try {
      const response = await fetch(content.trim());
      if (!response.ok) {
        throw new Error(`Failed to fetch IDL from URL: ${response.statusText}`);
      }
      const idlFromUrl = await response.text();
      // Validate JSON format
      JSON.parse(idlFromUrl); // Will throw if invalid
      return idlFromUrl;
    } catch (error) {
      throw new Error(`Failed to fetch or parse IDL from URL: `);
    }
  } else if (dataType === DATA_TYPE_IDL_JSON) {
    // Handle JSON type
    try {
      JSON.parse(content); // Validate JSON format
      return content;
    } catch (error) {
      throw new Error(`Invalid IDL JSON format: ${error}`);
    }
  } else {
    throw new Error(`Unknown data type: ${dataType}`);
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
  addSignerSeed: boolean = false,
  exportOnly: boolean
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
    addSignerSeed,
    DATA_TYPE_META_JSON,
    exportOnly
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

  // Get the data type from the account
  const dataType = new TextDecoder().decode(
    accountInfo.data.slice(40, 40 + DATA_TYPE_LENGTH).filter((x) => x !== 0)
  );

  // Get the data length and content
  const dataLenBytes = accountInfo.data.slice(
    METADATA_OFFSET - 4,
    METADATA_OFFSET
  );
  const dataLength = new DataView(
    dataLenBytes.buffer,
    dataLenBytes.byteOffset,
    dataLenBytes.byteLength
  ).getUint32(0, true); // true for little-endian

  const compressedData = accountInfo.data.slice(
    METADATA_OFFSET,
    METADATA_OFFSET + dataLength
  );
  const decompressedData = inflate(compressedData);
  const content = new TextDecoder("utf-8").decode(decompressedData);

  if (dataType === DATA_TYPE_META_URL) {
    // Handle URL type
    try {
      const response = await fetch(content.trim());
      if (!response.ok) {
        throw new Error(
          `Failed to fetch metadata from URL: ${response.statusText}`
        );
      }
      const metadata = await response.json();
      return metadata as ProgramMetaData;
    } catch (error) {
      throw new IDLError(
        `Failed to fetch or parse metadata from URL: ${error}`
      );
    }
  } else if (dataType === DATA_TYPE_META_JSON) {
    // Handle JSON type
    try {
      return JSON.parse(content) as ProgramMetaData;
    } catch (error) {
      throw new IDLError(`Invalid metadata JSON format: ${error}`);
    }
  } else {
    throw new IDLError(`Unknown data type: ${dataType}`);
  }
}

interface ExportedTransaction {
  base58: string;
  base64: string;
}

async function uploadProgramMetadataByJsonPath(
  metadataPath: string,
  programId: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFeesPerCU: number,
  addSignerSeed: boolean = false,
  exportOnly: boolean = false
): Promise<ExportedTransaction | void> {
  try {
    if (!fs.existsSync(metadataPath)) {
      throw new IDLError(`File not found: ${metadataPath}`);
    }

    // Read and validate metadata
    const metadata = JSON.parse(
      fs.readFileSync(metadataPath, "utf-8")
    ) as ProgramMetaData;
    if (!metadata.name) {
      throw new IDLError("Missing required metadata fields");
    }
    if (metadata.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.expiry)) {
      throw new IDLError("Expiry date must be in YYYY-MM-DD format");
    }

    const metadataBuffer = Buffer.from(JSON.stringify(metadata));
    return await uploadGenericDataBySeed(
      metadataBuffer,
      programId,
      keypair,
      rpcUrl,
      priorityFeesPerCU,
      PROGRAM_METADATA_SEED,
      addSignerSeed,
      DATA_TYPE_META_JSON,
      exportOnly
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new IDLError(`Failed to process metadata file: ${error.message}`);
    }
    throw new IDLError("Failed to process metadata file: Unknown error");
  }
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
  addSignerSeed: boolean = false,
  exportOnly: boolean
): Promise<void | ExportedTransaction> {
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
    return await uploadGenericDataBySeed(
      metadataUrlBuffer,
      programId,
      keypair,
      rpcUrl,
      priorityFeesPerCU,
      PROGRAM_METADATA_SEED,
      addSignerSeed,
      DATA_TYPE_META_URL,
      exportOnly
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

export async function closeProgramMetadata2(
  programId: PublicKey,
  authority: Keypair,
  rpcUrl: string,
  seed: string,
  priorityFees: number = 100000,
  additionalSignerSeed?: boolean
): Promise<void> {
  const { connection, provider, program } = setupConnection(rpcUrl, authority);

  // Find the metadata account PDA
  const metadataAccount = getMetadataAddressBySeed(
    programId,
    seed,
    additionalSignerSeed ? authority.publicKey : undefined
  );

  const closeInstruction = await program.methods
    .closeMetadataAccount2()
    .accountsPartial({
      metadataAccount: metadataAccount,
      authority: authority.publicKey,
    })
    .instruction();

  const tx = await createTransaction(
    connection,
    authority.publicKey,
    priorityFees
  );

  tx.add(closeInstruction);
  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Close metadata signature", signature);
  });
}

export async function closeProgramMetadata1(
  programId: PublicKey,
  authority: Keypair,
  rpcUrl: string,
  seed: string,
  priorityFees: number = 100000,
  additionalSignerSeed?: boolean
): Promise<void> {
  const { connection, provider, program } = setupConnection(rpcUrl, authority);

  const metadataAccount = getMetadataAddressBySeed(
    programId,
    seed,
    additionalSignerSeed ? authority.publicKey : undefined
  );

  const closeInstruction = await program.methods
    .closeMetadataAccount1()
    .accountsPartial({
      metadataAccount: metadataAccount,
      authority: authority.publicKey,
    })
    .instruction();

  const tx = await createTransaction(
    connection,
    authority.publicKey,
    priorityFees
  );

  tx.add(closeInstruction);
  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Close metadata signature", signature);
  });
}

async function getInitializeInstruction(
  metadataPdaAddress: PublicKey,
  programId: PublicKey,
  seed: string,
  addSignerSeed: boolean,
  dataType: string,
  provider: anchor.AnchorProvider
): Promise<anchor.web3.TransactionInstruction | null> {
  // Check if account already exists
  const metadataAccountInfo = await provider.connection.getAccountInfo(
    metadataPdaAddress
  );
  if (metadataAccountInfo) {
    return null;
  }

  // Get the program account to find its loader (owner)
  const programAccountInfo = await provider.connection.getAccountInfo(
    programId
  );
  if (!programAccountInfo) {
    throw new IDLError("Program account not found");
  }

  const programLoader = programAccountInfo.owner;
  console.log("Program loader", programLoader.toBase58());

  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    programLoader
  );

  console.log("Add signer seed", addSignerSeed);
  console.log("Program data address", programDataAddress.toBase58());

  const program = new anchor.Program(IDL as MetadataProgram, provider);

  return addSignerSeed
    ? await program.methods
        .initializeWithSignerSeed(dataType, seed)
        .accountsPartial({
          pda: metadataPdaAddress,
          programId: programId,
          programData: programDataAddress,
        })
        .instruction()
    : await program.methods
        .initialize(dataType, seed)
        .accountsPartial({
          pda: metadataPdaAddress,
          programId: programId,
          programData: programDataAddress,
        })
        .instruction();
}

async function getSetBufferTransaction(
  bufferAddress: PublicKey,
  programId: PublicKey,
  authority: PublicKey,
  rpcUrl: string,
  priorityFeesPerCU: number,
  seed: string,
  addSignerSeed: boolean,
  dataType: string
): Promise<anchor.web3.Transaction> {
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(Keypair.generate()), // Dummy wallet since we're just building tx
    {}
  );
  const program = new anchor.Program(IDL as MetadataProgram, provider);

  const metadataAccount = getMetadataAddressBySeed(
    programId,
    seed,
    addSignerSeed ? authority : undefined
  );

  const tx = new anchor.web3.Transaction();
  tx.feePayer = authority;

  if (priorityFeesPerCU > 0) {
    const priorityFeeInstruction =
      anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeesPerCU,
      });
    tx.add(priorityFeeInstruction);
  }

  // Add init/resize/setBuffer instructions as needed
  const initInstruction = await getInitializeInstruction(
    metadataAccount,
    programId,
    seed,
    addSignerSeed,
    dataType,
    provider
  );

  if (initInstruction) {
    tx.add(initInstruction);
  }

  const bufferAccountInfo = await connection.getAccountInfo(bufferAddress);
  if (!bufferAccountInfo) {
    throw new Error("Buffer account not found");
  }

  const setBufferInstruction = await program.methods
    .setBuffer()
    .accountsPartial({
      pda: metadataAccount,
      buffer: bufferAddress,
      authority: authority,
      programId: programId,
    })
    .instruction();

  tx.add(setBufferInstruction);

  return tx;
}

async function closeBuffer(
  bufferAddress: PublicKey,
  authority: Keypair,
  rpcUrl: string,
  priorityFees: number = 100000
): Promise<void> {
  const { connection, provider, program } = setupConnection(rpcUrl, authority);

  const closeInstruction = await program.methods
    .closeBuffer()
    .accountsPartial({
      buffer: bufferAddress,
      authority: authority.publicKey,
    })
    .instruction();

  const tx = await createTransaction(
    connection,
    authority.publicKey,
    priorityFees
  );

  tx.add(closeInstruction);
  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Close buffer signature", signature);
  });
}

async function listAccountsByType(
  authority: PublicKey,
  rpcUrl: string,
  accountType: string
): Promise<
  Array<{
    address: PublicKey;
    dataLength: number;
    dataType: string;
    programId: PublicKey;
  }>
> {
  const connection = new anchor.web3.Connection(rpcUrl);
  const program = new anchor.Program(
    IDL as MetadataProgram,
    new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(Keypair.generate()),
      {}
    )
  );

  const discriminator = IDL.accounts.find(
    (account) => account.name === accountType
  )?.discriminator;

  if (!discriminator) {
    throw new Error(`${accountType} discriminator not found in IDL`);
  }

  const accounts = await connection.getProgramAccounts(program.programId, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(discriminator)),
        },
      },
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: authority.toBase58(),
        },
      },
    ],
  });

  return accounts.map(({ pubkey, account }) => {
    const decoded = program.coder.accounts.decode(
      accountType.charAt(0).toLowerCase() + accountType.slice(1),
      account.data
    );
    return {
      address: pubkey,
      dataLength: decoded.dataLen,
      dataType: Buffer.from(decoded.dataType).toString().replace(/\0+$/, ""),
      programId: decoded.programId,
    };
  });
}

async function listBuffers(
  authority: PublicKey,
  rpcUrl: string
): Promise<
  Array<{
    address: PublicKey;
    dataLength: number;
    dataType: string;
    programId: PublicKey;
  }>
> {
  return listAccountsByType(authority, rpcUrl, "MetadataBuffer");
}

async function listPDAs(
  authority: PublicKey,
  rpcUrl: string
): Promise<
  Array<{
    address: PublicKey;
    dataLength: number;
    dataType: string;
    programId: PublicKey;
  }>
> {
  return listAccountsByType(authority, rpcUrl, "MetadataAccount2");
}

async function closeProgramMetadataByPdaAddress(
  pdaAddress: PublicKey,
  keypair: Keypair,
  rpcUrl: string,
  priorityFees: number = 100000
): Promise<void> {
  const { connection, provider, program } = setupConnection(rpcUrl, keypair);

  const closeInstruction = await program.methods
    .closeMetadataAccount2()
    .accountsPartial({
      metadataAccount: pdaAddress,
      authority: keypair.publicKey,
    })
    .instruction();

  const tx = await createTransaction(
    connection,
    keypair.publicKey,
    priorityFees
  );

  tx.add(closeInstruction);
  provider.wallet.signTransaction(tx);

  await withRetry(async () => {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Close metadata signature", signature);
  });
}

export {
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByJsonPath,
  uploadProgramMetadataByUrl,
  setAuthority,
  fetchIDL,
  getAssociatedIdlAddress,
  getAssociatedMetadataAddress,
  getMetadataAddressBySeed,
  uploadGenericDataBySeed,
  uploadProgramMetadata,
  fetchProgramMetadata,
  ProgramMetaData,
  getInitializeInstruction,
  getSetBufferTransaction,
  closeBuffer,
  listBuffers,
  listPDAs,
  listAccountsByType,
  closeProgramMetadataByPdaAddress,
};
