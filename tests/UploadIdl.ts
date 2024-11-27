import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";

async function InitializeIdlAccount(idlPath: string) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

  const [idlAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("idl", "utf8"), provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  console.log("Idl account", idlAccount.toBase58());

  const idl = fs.readFileSync(idlPath); // Read the IDL file
  const idlBytes = deflate(new Uint8Array(idl)); // Compress the IDL JSON
  const bufferSize = idlBytes.length + 44; // 44 bytes for discriminator, authority, and data_len

  let firstIdlAccountSize = Math.min(10240, bufferSize);

  // Calculate the leftover size that needs resizing
  let leftOverToResize = Math.max(0, bufferSize - firstIdlAccountSize);

  const initializeInstruction = await program.methods
    .initialize(firstIdlAccountSize)
    .instruction();

  var getLatestBlockhash = await provider.connection.getLatestBlockhash();

  var tx = new anchor.web3.Transaction();
  tx.add(initializeInstruction);

  while (leftOverToResize > 0) {
    // Determine the chunk size for this resize step (max 10KB per step)
    const chunkSize = Math.min(10240, leftOverToResize);
    firstIdlAccountSize += chunkSize;
    const resizeInstruction = await program.methods
      .resize(firstIdlAccountSize)
      .accountsPartial({
        idl: idlAccount,
      })
      .instruction();

    // Add the resize instruction to the transaction
    tx.add(resizeInstruction);
    console.log("Resize to {} left over {}", chunkSize, leftOverToResize);

    // Subtract the chunk size from the remaining size to resize
    leftOverToResize -= chunkSize;
  }

  tx.recentBlockhash = getLatestBlockhash.blockhash;
  tx.feePayer = provider.wallet.publicKey;
  provider.wallet.signTransaction(tx);

  var signature = await provider.connection.sendRawTransaction(tx.serialize());
  console.log("Signature", signature);

  console.log("Idl account created", idlAccount.toBase58());

  await provider.connection.confirmTransaction(signature);
}

async function CreateBuffer(idlPath: string): Promise<Keypair | null> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

  const idl = fs.readFileSync(idlPath); // Read the IDL file
  const idlBytes = deflate(new Uint8Array(idl)); // Compress the IDL JSON
  const bufferSize = idlBytes.length + 44; // 44 bytes for discriminator, authority, and data_len
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

async function WriteBuffer(
  programId: PublicKey,
  idlPath: string,
  signer: PublicKey,
  bufferAddress: PublicKey
) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

  const idl = fs.readFileSync(idlPath); // Read the IDL file
  const idlBytes = deflate(new Uint8Array(idl)); // Compress the IDL JSON

  const [idlAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("idl", "utf8"), signer.toBuffer()],
    programId
  );

  const accountInfo = await provider.connection.getAccountInfo(idlAccount);
  if (!accountInfo) {
    console.log("PDA account does not exist. Creating account...");
  }

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
  console.log("IDL uploaded successfully!");
}

async function SetBuffer(bufferAddress: PublicKey) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

  await program.methods
    .setBuffer()
    .accountsPartial({
      buffer: bufferAddress,
    })
    .rpc();
}

async function FetchIDL(
  programId: PublicKey,
  signer: PublicKey
): Promise<string | null> {
  const [idlAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("idl", "utf8"), signer.toBuffer()],
    programId
  );

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

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
  const dataLenBytes = accountInfo.data.slice(40, 44); // `data_len` starts at offset 40
  const dataLength = new DataView(dataLenBytes.buffer).getUint32(0, true); // Little-endian

  const compressedData = accountInfo.data.slice(44, 44 + dataLength); // Skip metadata (44 bytes)

  // Decompress the data
  const decompressedData = inflate(compressedData);

  // Convert Uint8Array to string
  const idlString = new TextDecoder("utf-8").decode(decompressedData);

  return idlString;
}

export { InitializeIdlAccount, CreateBuffer, WriteBuffer, SetBuffer, FetchIDL };
