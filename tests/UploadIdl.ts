import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { inflate, deflate } from "pako";

async function WriteIDL(
  programId: PublicKey,
  idlPath: string,
  signer: PublicKey
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

    const tx = await program.methods.writeIdl(Buffer.from(chunk)).rpc();

    console.log("sig", tx);
    offset += CHUNK_SIZE;
  }
  console.log("IDL uploaded successfully!");
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

export { WriteIDL, FetchIDL };
