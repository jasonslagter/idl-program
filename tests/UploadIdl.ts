import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;
const ADDITIONAL_DATA_OFFSET = 44;

async function UploadIdlByJsonPath(idlPath: string, programId: PublicKey) {
  let buffer: Buffer = fs.readFileSync(idlPath);
  await InitIdl(buffer, programId);
}

async function UploadIdlUrl(url: string, programId: PublicKey) {
  let buffer: Buffer = Buffer.from(url, "utf8");
  await InitIdl(buffer, programId);
}

async function InitIdl(buffer: Buffer, programId: PublicKey) {
  const idlAccount = GetIdlAccount(programId);
  console.log("Idl pda address", idlAccount.toBase58());
  await InitializeIdlAccount(idlAccount, programId);
  console.log("Initialized Idl account");
  const bufferAddress = await CreateBuffer(buffer);
  console.log("Buffer created");
  await WriteBuffer(buffer, bufferAddress.publicKey);
  console.log("Buffer written");
  await SetBuffer(bufferAddress.publicKey, programId);
  console.log("Buffer set and buffer closed");
}

async function InitializeIdlAccount(
  idlPdaAddress: PublicKey,
  programId: PublicKey
) {
  console.log("Idl account", idlPdaAddress.toBase58());

  const idlAccountInfo = await provider.connection.getAccountInfo(
    idlPdaAddress
  );
  if (!idlAccountInfo) {
    const BPF_LOADER_2_PROGRAM_ID = new PublicKey(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    );

    const [programDataAddress] = await PublicKey.findProgramAddress(
      [programId.toBuffer()],
      BPF_LOADER_2_PROGRAM_ID
    );

    const signature = await program.methods
      .initialize()
      .accountsPartial({
        idl: idlPdaAddress,
        programId: programId,
        programData: programDataAddress,
      })
      .rpc();

    console.log("Signature", signature);

    console.log("Idl account created", idlPdaAddress.toBase58());
    await provider.connection.confirmTransaction(signature);
  } else {
    console.log("Idl account already exists");
  }
}

async function CreateBuffer(buffer: Buffer): Promise<Keypair | null> {
  const idlBytes = deflate(new Uint8Array(buffer)); // Compress the IDL JSON
  const bufferSize = idlBytes.length + ADDITIONAL_DATA_OFFSET; // 44 bytes for discriminator, authority, and data_len
  let bufferKeypair = new Keypair();

  let createAccountInstruction = anchor.web3.SystemProgram.createAccount({
    fromPubkey: provider.wallet.publicKey,
    newAccountPubkey: bufferKeypair.publicKey,
    space: bufferSize,
    lamports: await provider.connection.getMinimumBalanceForRentExemption(
      bufferSize
    ),
    programId: program.programId,
  });

  const createBufferInstruction = await program.methods
    .createBuffer()
    .accountsPartial({
      buffer: bufferKeypair.publicKey,
    })
    .instruction();

  var getLatestBlockhash = await provider.connection.getLatestBlockhash();

  var tx = new anchor.web3.Transaction();
  tx.add(createAccountInstruction);
  tx.add(createBufferInstruction);
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = provider.wallet.publicKey;
  tx.sign(bufferKeypair);
  provider.wallet.signTransaction(tx);

  var signature = await provider.connection.sendRawTransaction(tx.serialize());
  console.log("Signature", signature);

  console.log("Buffer Address created", bufferKeypair.publicKey.toBase58());

  await provider.connection.confirmTransaction(signature);

  return bufferKeypair;
}

async function WriteBuffer(buffer: Buffer, bufferAddress: PublicKey) {
  const idlBytes = deflate(new Uint8Array(buffer)); // Compress the buffer

  const CHUNK_SIZE = 900;
  let offset = 0;

  while (offset < idlBytes.length) {
    const chunk = idlBytes.subarray(offset, offset + CHUNK_SIZE); // Use subarray for Uint8Array

    const tx = await program.methods
      .writeBuffer(Buffer.from(chunk))
      .accountsPartial({
        buffer: bufferAddress,
      })
      .rpc();

    console.log("sig", tx);
    offset += CHUNK_SIZE;
  }
  console.log("Write buffer successfully!");
}

async function SetBuffer(bufferAddress: PublicKey, programId: PublicKey) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

  const idlAccount = GetIdlAccount(programId);

  const idlAccountAccountInfo = await provider.connection.getAccountInfo(
    idlAccount
  );
  const bufferAccountAccountInfo = await provider.connection.getAccountInfo(
    bufferAddress
  );

  var idlAccountSize = idlAccountAccountInfo.data.length;
  var bufferAccountSize = bufferAccountAccountInfo.data.length;

  var tx = new anchor.web3.Transaction();

  console.log("IDL account size", idlAccountSize);
  console.log("Buffer account size", bufferAccountSize);
  if (bufferAccountSize < idlAccountSize) {
    const resizeInstruction = await program.methods
      .resize(bufferAccountSize)
      .accountsPartial({
        idl: idlAccount,
        programId: programId,
      })
      .instruction();
    tx.add(resizeInstruction);
  } else {
    let leftOverToResize = Math.max(0, bufferAccountSize - idlAccountSize);

    while (leftOverToResize > 0) {
      // Determine the chunk size for this resize step (max 10KB per step)
      const chunkSize = Math.min(10240, leftOverToResize);
      idlAccountSize += chunkSize;
      const resizeInstruction = await program.methods
        .resize(idlAccountSize)
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
    .setBuffer()
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

  var getLatestBlockhash = await provider.connection.getLatestBlockhash();
  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = provider.wallet.publicKey;
  provider.wallet.signTransaction(tx);

  var signature = await provider.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  await provider.connection.confirmTransaction(signature);
  console.log("Signature set buffer", signature);
}

function GetIdlAccount(programId: PublicKey): PublicKey {
  const [idlAccount] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("idl", "utf8"), programId.toBuffer()],
    new PublicKey("idLB41CuMPpWZmQGGxpsxbyGDWWzono4JnFLJxQakrE")
  );
  return idlAccount;
}

async function FetchIDL(programId: PublicKey): Promise<string | null> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const idlAccount = GetIdlAccount(programId);

  // If we get the IDL account we can not access the additional data bytes at
  // the end so we need to use getaccount info and manually cut of the front.
  // const idl = await program.account.idlAccount.fetch(idlAccount);
  // console.log("IDL", idl);

  const accountInfo = await provider.connection.getAccountInfo(idlAccount);

  if (!accountInfo) {
    console.error("IDL account not found!");
    return;
  }
  // In the account we have the anchor descriminator 8 + authority 32 + data_len 4 + data
  const dataLenBytes = accountInfo.data.slice(
    ADDITIONAL_DATA_OFFSET - 4,
    ADDITIONAL_DATA_OFFSET
  ); // `data_len` starts at offset 40
  const dataLength = new DataView(dataLenBytes.buffer).getUint32(0, true); // Little-endian

  console.log("Data", accountInfo.data);

  const compressedData = accountInfo.data.slice(
    ADDITIONAL_DATA_OFFSET,
    ADDITIONAL_DATA_OFFSET + dataLength
  ); // Skip metadata (44 bytes)

  // Decompress the data
  const decompressedData = inflate(compressedData);

  // Convert Uint8Array to string
  const idlString = new TextDecoder("utf-8").decode(decompressedData);

  return idlString;
}

export {
  InitializeIdlAccount,
  CreateBuffer,
  WriteBuffer,
  SetBuffer,
  FetchIDL,
  UploadIdlByJsonPath,
  UploadIdlUrl,
  GetIdlAccount,
};
