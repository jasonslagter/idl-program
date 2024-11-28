import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import {
  FetchIDL,
  GetIdlAccount,
  UploadIdlByJsonPath,
  UploadIdlUrl,
} from "./UploadIdl";
import { assert } from "chai";
import { inflate } from "pako";
import { PublicKey } from "@solana/web3.js";

const IDL_PATH = "./tests/testidl.json";
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const testIdlProgram = new PublicKey(
  "MkabCfyUD6rBTaYHpgKBBpBo5qzWA2pK2hrGGKMurJt"
);
const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

describe("upload-idl-anchor", () => {
  it.only("Write IDL json !", async () => {
    await UploadIdlByJsonPath(IDL_PATH, testIdlProgram);

    const idlAccount = GetIdlAccount(testIdlProgram);

    console.log("Idl account", idlAccount.toBase58());
    const accountInfo = await provider.connection.getAccountInfo(idlAccount);

    assert.ok(accountInfo, "IDL account should exist after initialization");

    const idlResult = await FetchIDL(testIdlProgram);

    try {
      const idlJson = JSON.parse(idlResult);
      assert.ok(idlJson.address, "IDL JSON should have a name field");
      assert.equal(
        idlJson.address,
        testIdlProgram,
        "Progam id is correct in the json "
      );
      console.log("Parsed IDL JSON:", idlJson);
    } catch (err) {
      assert.fail("Failed to parse IDL JSON");
    }
  });

  it.only("Write Url", async () => {
    const url = "http://example.com";

    await UploadIdlUrl(url, testIdlProgram);

    const idlAccount = GetIdlAccount(testIdlProgram);

    const idl = await program.account.idlAccount.fetch(idlAccount);
    const connection = anchor.getProvider().connection;
    const accountInfo = await connection.getAccountInfo(idlAccount);

    if (!accountInfo) {
      console.error("IDL account not found!");
      return;
    }

    const rawData = accountInfo.data.slice(44, 44 + idl.dataLen); // Skip metadata (44 bytes + 8 descriminator, 4 dataLen, 32 authority)
    const decompressedData = inflate(rawData);
    const decompressedUrl = Buffer.from(decompressedData).toString("utf8");

    console.log("Decompressed Url:", decompressedUrl);
    assert.equal(
      decompressedUrl,
      url,
      "The saved string should match the input URL"
    );
  });
});
