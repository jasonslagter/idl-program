import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { UploadIdlAnchor } from "../target/types/upload_idl_anchor";
import {
  FetchIDL,
  GetIdlAddress,
  UploadIdlByJsonPath,
  UploadIdlUrl,
} from "./UploadIdl";
import { assert } from "chai";
import { inflate } from "pako";
import { Keypair, PublicKey } from "@solana/web3.js";

const IDL_PATH = "./tests/testidl.json";

const TEST_IDL_PROGRAM = new PublicKey(
  "6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A"
);
const program = anchor.workspace.UploadIdlAnchor as Program<UploadIdlAnchor>;

const rpcUrl = "http://localhost:8899";
const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

const keypair = Keypair.fromSecretKey(
  Uint8Array.from([
    165, 5, 155, 75, 149, 143, 198, 145, 146, 255, 28, 45, 147, 94, 110, 10,
    184, 86, 187, 89, 28, 56, 193, 244, 24, 140, 154, 234, 77, 240, 147, 100,
    13, 59, 110, 247, 210, 26, 178, 172, 66, 102, 46, 121, 92, 139, 67, 90, 116,
    118, 14, 75, 172, 193, 227, 116, 23, 245, 230, 128, 99, 204, 101, 78,
  ])
);

describe("upload-idl-anchor", () => {
  it.only("Write IDL json !", async () => {
    const airdropSig = await connection.requestAirdrop(
      keypair.publicKey,
      1000000000
    );
    await connection.confirmTransaction(airdropSig, "finalized");

    await UploadIdlByJsonPath(IDL_PATH, TEST_IDL_PROGRAM, keypair, rpcUrl);

    const idlAccount = GetIdlAddress(TEST_IDL_PROGRAM);

    console.log("Idl account", idlAccount.toBase58());
    const accountInfo = await connection.getAccountInfo(idlAccount);

    console.log("Idl account info ", accountInfo);
    assert.ok(accountInfo, "IDL account should exist after initialization");

    const idlResult = await FetchIDL(TEST_IDL_PROGRAM, rpcUrl);

    var idlJson;
    try {
      idlJson = JSON.parse(idlResult);
    } catch (err) {
      assert.fail("Failed to parse IDL JSON", err);
    }
    assert.ok(idlJson.address, "IDL JSON should have a name field");
    assert.equal(
      idlJson.address,
      TEST_IDL_PROGRAM,
      "Program id is correct in the json "
    );
    console.log("Parsed IDL JSON:", idlJson);
  });

  it.only("Write Url", async () => {
    const url = "http://example.com";

    await UploadIdlUrl(url, TEST_IDL_PROGRAM, keypair, rpcUrl);

    const idlAccount = GetIdlAddress(TEST_IDL_PROGRAM);

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
