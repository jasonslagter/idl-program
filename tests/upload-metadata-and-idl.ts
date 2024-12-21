import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  fetchIDL,
  fetchProgramMetadata,
  getAssociatedIdlAddress,
  getAssociatedMetadataAddress,
  METADATA_OFFSET,
  setAuthority,
  uploadIdlByJsonPath,
  uploadIdlUrl,
  uploadProgramMetadataByJsonPath,
  uploadProgramMetadataByUrl,
} from "../js_sdk/src/ProgramMetaData";
import { assert } from "chai";
import { inflate } from "pako";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { MetadataProgram } from "../target/types/metadata_program";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const IDL_PATH = "./tests/testidl.json";
const META_DATA_JSON = "./tests/metadata.json";

const TEST_IDL_PROGRAM = new PublicKey(
  "6XzaKuAwqP7Nn37vwRdUqpuzNX6K8s1ADE6tHXSZG17A"
);
const program = anchor.workspace.MetadataProgram as Program<MetadataProgram>;

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

describe("Test metadata program with idl and program metadata", () => {
  before(async () => {
    const airdropSig = await connection.requestAirdrop(
      keypair.publicKey,
      1000000000
    );
    await connection.confirmTransaction(airdropSig, "confirmed");
  });

  it("Write IDL Url", async () => {
    const url = "http://example.com";

    await uploadIdlUrl(url, TEST_IDL_PROGRAM, keypair, rpcUrl, 0, false);

    const idlAccount = getAssociatedIdlAddress(TEST_IDL_PROGRAM);

    const idl = await program.account.metadataAccount3.fetch(idlAccount);
    const accountInfo = await connection.getAccountInfo(idlAccount);

    if (!accountInfo) {
      console.error("IDL account not found!");
      return;
    }

    const rawData = accountInfo.data.slice(
      METADATA_OFFSET,
      METADATA_OFFSET + idl.dataLen
    );

    const decompressedData = inflate(rawData);
    const decompressedUrl = Buffer.from(decompressedData).toString("utf8");
    console.log("Decompressed Url:", decompressedUrl);
    const fetchedAnchorAccount = await program.account.metadataAccount3.fetch(
      idlAccount
    );
    const dataType = Buffer.from(fetchedAnchorAccount.dataType).toString(
      "utf8"
    );
    console.log("Data type hex:", Buffer.from(dataType).toString("hex"));
    console.log("Expected hex:", Buffer.from("idl").toString("hex"));
    assert.equal(
      dataType.split("\0")[0], // Split on null byte and take first part
      "idl",
      "idl data type should be idl"
    );

    assert.equal(
      decompressedUrl,
      url,
      "The saved string should match the input URL"
    );
  });

  it("Write IDL json !", async () => {
    await uploadIdlByJsonPath(
      IDL_PATH,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false
    );

    const idlAccount = getAssociatedIdlAddress(TEST_IDL_PROGRAM);

    console.log("Idl account", idlAccount.toBase58());
    const accountInfo = await connection.getAccountInfo(idlAccount);

    console.log("Idl account info ", accountInfo);
    assert.ok(accountInfo, "IDL account should exist after initialization");

    const idlResult = await fetchIDL(TEST_IDL_PROGRAM, rpcUrl);

    const fetchedAnchorAccount = await program.account.metadataAccount3.fetch(
      idlAccount
    );
    console.log("fetchedAnchorAccount.dataLen", fetchedAnchorAccount.dataLen);

    const dataType = Buffer.from(fetchedAnchorAccount.dataType).toString(
      "utf8"
    );
    console.log("Data type hex:", Buffer.from(dataType).toString("hex"));
    console.log("Expected hex:", Buffer.from("idl.json").toString("hex"));
    assert.equal(
      dataType.split("\0")[0], // Split on null byte and take first part
      "idl",
      "idl data type should be idl.json"
    );

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

  it("Write program metadata json", async () => {
    const LogoUrl =
      "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png";

    await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false
    );

    const metadata = await fetchProgramMetadata(TEST_IDL_PROGRAM, rpcUrl);

    console.log("Metadata", metadata);

    assert.equal(
      metadata.logo,
      LogoUrl,
      "The saved string should match the input URL"
    );
  });

  it("Upload non associated metadata", async () => {
    const LogoUrl =
      "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png";

    await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      true
    );

    const metadata = await fetchProgramMetadata(
      TEST_IDL_PROGRAM,
      rpcUrl,
      keypair.publicKey
    );

    console.log("Metadata", metadata);
    // This will still be the old logo because the authority was removed and the second upload was not confirmed
    assert.equal(
      metadata.logo,
      LogoUrl,
      "The saved string should match the input URL"
    );
  });

  it("Test change and remove authority", async () => {
    const LogoUrl =
      "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png";

    await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false
    );

    const metadataAccount = getAssociatedMetadataAddress(TEST_IDL_PROGRAM);

    // Remove authority
    await setAuthority(metadataAccount, PublicKey.default, keypair, rpcUrl, 0);

    try {
      // Try write something else in the PDA
      await uploadProgramMetadataByUrl(
        "https://raw.githubusercontent.com/solana-developers/idl-program/refs/heads/main/tests/metadata.json",
        TEST_IDL_PROGRAM,
        keypair,
        rpcUrl,
        0,
        false
      );
    } catch (error) {
      console.log("Expected Error because authority was removed", error);
    }

    const metadata = await fetchProgramMetadata(TEST_IDL_PROGRAM, rpcUrl);

    console.log("Metadata", metadata);
    // This will still be the old logo because the authority was removed and the second upload was not confirmed
    assert.equal(
      metadata.logo,
      LogoUrl,
      "The saved string should match the input URL"
    );
  });

  it("Test export-transaction buffer creation and transaction execution", async () => {
    const LogoUrl =
      "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png";

    // First, get the exported transaction
    const result = await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false,
      true // exportOnly = true
    );

    assert.ok(result, "Should return serialized transaction");
    assert.ok(result.base58, "Should have base58 encoded transaction");
    assert.ok(result.base64, "Should have base64 encoded transaction");

    // Create new transaction from the serialized message
    const messageBytes = bs58.decode(result.base58);
    const message = anchor.web3.Message.from(Buffer.from(messageBytes));
    const transaction = anchor.web3.Transaction.populate(message);

    // Set the blockhash and fee payer
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Clear any existing signatures and sign fresh
    transaction.signatures = [];
    transaction.sign(keypair);

    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(signature, "confirmed");

    // Verify the metadata was written correctly
    const metadata = await fetchProgramMetadata(TEST_IDL_PROGRAM, rpcUrl);
    console.log("Metadata after sending exported transaction:", metadata);

    assert.equal(
      metadata.logo,
      LogoUrl,
      "The saved metadata should match the input"
    );
  });

  it("Should handle export-transaction with different account states", async () => {
    const LogoUrl = "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png";

    // First test: Export transaction for non-existent PDA (should include init)
    const result1 = await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false,
      true // exportTransaction = true
    );

    assert.ok(result1, "Should return serialized transaction");
    const tx1 = decodeAndVerifyTransaction(result1.base58);
    assert.equal(tx1.instructions.length, 2, "Should have 3 instructions (priority fee, setBuffer) because init was already done in another test");

    // Execute the transaction to set up for next test
    await executeTransaction(tx1);

    // Second test: Export transaction for existing PDA (should not include init)
    const result2 = await uploadProgramMetadataByJsonPath(
      META_DATA_JSON,
      TEST_IDL_PROGRAM,
      keypair,
      rpcUrl,
      0,
      false,
      true
    );

    assert.ok(result2, "Should return serialized transaction");
    const tx2 = decodeAndVerifyTransaction(result2.base58);
    assert.equal(tx2.instructions.length, 2, "Should have 2 instructions (priority fee, setBuffer)");

    // Verify metadata was written correctly
    const metadata = await fetchProgramMetadata(TEST_IDL_PROGRAM, rpcUrl);
    assert.equal(metadata.logo, LogoUrl, "The saved metadata should match the input");
  });

  // Helper functions for the test
  function decodeAndVerifyTransaction(base58Tx: string): Transaction {
    const messageBytes = bs58.decode(base58Tx);
    const message = anchor.web3.Message.from(Buffer.from(messageBytes));
    return Transaction.populate(message);
  }

  async function executeTransaction(transaction: Transaction): Promise<void> {
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.signatures = [];
    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(signature, "confirmed");
  }
});
