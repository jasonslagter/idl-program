import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import {
  CreateBuffer,
  FetchIDL,
  InitializeIdlAccount,
  SetBuffer,
  WriteBuffer,
} from "./UploadIdl";
import { assert } from "chai";

const IDL_PATH = "./tests/testidl.json";

describe("upload-idl-anchor", () => {
  it.only("Is initialized!", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace
      .UploadIdlAnchor as Program<UploadIdlAnchor>;

    await InitializeIdlAccount(IDL_PATH);

    const [idlAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("idl", "utf8"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    const accountInfo = await provider.connection.getAccountInfo(idlAccount);

    assert.ok(accountInfo, "IDL account should exist after initialization");
  });

  // TODO: Disabled: Need to create buffer of size of string and then write
  it("Write Url", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace
      .UploadIdlAnchor as Program<UploadIdlAnchor>;

    const url = "http://example.com";
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(url);

    const tx = await program.methods.writeBuffer(buffer).rpc();
    console.log("Your transaction signature", tx);

    // Fetch the IDL
    const [idlAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("idl", "utf8"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const idl = await program.account.idlAccount.fetch(idlAccount);

    console.log("IDL", idl);

    const connection = anchor.getProvider().connection;
    const accountInfo = await connection.getAccountInfo(idlAccount);

    if (!accountInfo) {
      console.error("IDL account not found!");
      return;
    }

    const rawData = accountInfo.data.slice(44, 44 + idl.dataLen); // Skip metadata (44 bytes + 8 descriminator, 4 dataLen, 32 authority)
    const savedString = rawData.toString("utf8"); // Convert to a string

    console.log("Saved String:", savedString);
    assert.equal(
      savedString,
      url,
      "The saved string should match the input URL"
    );
  });

  it.only("Write IDL", async () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace
      .UploadIdlAnchor as Program<UploadIdlAnchor>;

    console.log("Creating buffer");

    const bufferKeypair = await CreateBuffer(IDL_PATH);

    await WriteBuffer(
      program.programId,
      IDL_PATH,
      provider.wallet.publicKey,
      bufferKeypair.publicKey
    );

    console.log("buffer written ", bufferKeypair.publicKey.toString());

    await SetBuffer(bufferKeypair.publicKey);

    console.log("buffer set");

    const idlResult = await FetchIDL(
      program.programId,
      provider.wallet.publicKey
    );

    // Assert that the IDL result is not null or undefined
    assert.ok(idlResult, "Fetched IDL should not be null or undefined");

    try {
      const idlJson = JSON.parse(idlResult);
      assert.ok(idlJson.address, "IDL JSON should have a name field");
      assert.equal(
        idlJson.address,
        "MkabCfyUD6rBTaYHpgKBBpBo5qzWA2pK2hrGGKMurJt",
        "Progam id is correct in the json "
      );
      console.log("Parsed IDL JSON:", idlJson);
    } catch (err) {
      assert.fail("Failed to parse IDL JSON");
    }
  });
});
