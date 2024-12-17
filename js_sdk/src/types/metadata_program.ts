/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/metadata_program.json`.
 */
export type MetadataProgram = {
  address: "pmetaypqG6SiB47xMigYVMAkuHDWeSDXcv3zzDrJJvA";
  metadata: {
    name: "metadataProgram";
    version: "0.1.0";
    spec: "0.1.0";
    description: "A program to attach metadata to programs. Like for example the IDL or metadata.";
  };
  instructions: [
    {
      name: "closeBuffer";
      discriminator: [46, 114, 179, 58, 57, 45, 194, 172];
      accounts: [
        {
          name: "buffer";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
        }
      ];
      args: [];
    },
    {
      name: "closeMetadataAccount1";
      discriminator: [214, 59, 103, 132, 141, 70, 199, 195];
      accounts: [
        {
          name: "metadataAccount";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
        }
      ];
      args: [];
    },
    {
      name: "closeMetadataAccount2";
      discriminator: [121, 166, 201, 151, 202, 148, 168, 175];
      accounts: [
        {
          name: "metadataAccount";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
        }
      ];
      args: [];
    },
    {
      name: "createBuffer";
      discriminator: [175, 76, 101, 74, 224, 249, 104, 170];
      accounts: [
        {
          name: "buffer";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
        }
      ];
      args: [
        {
          name: "dataType";
          type: "string";
        }
      ];
    },
    {
      name: "initialize";
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: "pda";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "programId";
              },
              {
                kind: "arg";
                path: "seed";
              }
            ];
          };
        },
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "programId";
        },
        {
          name: "programData";
        }
      ];
      args: [
        {
          name: "dataType";
          type: "string";
        },
        {
          name: "seed";
          type: "string";
        }
      ];
    },
    {
      name: "initializeWithSignerSeed";
      discriminator: [55, 45, 87, 223, 169, 179, 103, 71];
      accounts: [
        {
          name: "pda";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "programId";
              },
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "arg";
                path: "seed";
              }
            ];
          };
        },
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "programId";
        },
        {
          name: "programData";
        }
      ];
      args: [
        {
          name: "dataType";
          type: "string";
        },
        {
          name: "seed";
          type: "string";
        }
      ];
    },
    {
      name: "resize";
      discriminator: [74, 27, 74, 155, 56, 134, 175, 125];
      accounts: [
        {
          name: "pda";
          writable: true;
        },
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "programId";
        }
      ];
      args: [
        {
          name: "len";
          type: "u16";
        }
      ];
    },
    {
      name: "setAuthority";
      discriminator: [133, 250, 37, 21, 110, 163, 26, 121];
      accounts: [
        {
          name: "pda";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
          relations: ["pda"];
        }
      ];
      args: [
        {
          name: "newAuthority";
          type: "pubkey";
        }
      ];
    },
    {
      name: "setBuffer";
      discriminator: [13, 212, 241, 0, 78, 93, 17, 51];
      accounts: [
        {
          name: "buffer";
          writable: true;
        },
        {
          name: "pda";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
          relations: ["pda"];
        },
        {
          name: "programId";
        }
      ];
      args: [];
    },
    {
      name: "writeBuffer";
      discriminator: [164, 194, 69, 154, 75, 169, 228, 85];
      accounts: [
        {
          name: "buffer";
          writable: true;
        },
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "data";
          type: "bytes";
        }
      ];
    }
  ];
  accounts: [
    {
      name: "metadataAccount";
      discriminator: [32, 224, 226, 224, 77, 64, 109, 234];
    },
    {
      name: "metadataAccount2";
      discriminator: [217, 197, 213, 23, 62, 14, 230, 192];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "wrongAuthority";
      msg: "Only the program upgrade authority can initialize the associated program metadata account";
    },
    {
      code: 6001;
      name: "notExecutable";
      msg: "The program account is not executable";
    },
    {
      code: 6002;
      name: "notAProgram";
      msg: "The program account is not a program. Not owned by the BPF loader";
    },
    {
      code: 6003;
      name: "shouldBeProgramAccount";
      msg: "The program account should not be a program data account";
    },
    {
      code: 6004;
      name: "dataTypeTooLong";
      msg: "Data type is too long";
    }
  ];
  types: [
    {
      name: "metadataAccount";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "dataType";
            type: {
              array: ["u8", 16];
            };
          },
          {
            name: "dataLen";
            type: "u32";
          }
        ];
      };
    },
    {
      name: "metadataAccount2";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "dataType";
            type: {
              array: ["u8", 16];
            };
          },
          {
            name: "programId";
            type: "pubkey";
          },
          {
            name: "dataLen";
            type: "u32";
          }
        ];
      };
    }
  ];
  constants: [
    {
      name: "dataTypeIdlJson";
      type: "string";
      value: '"idl.json"';
    },
    {
      name: "dataTypeIdlUrl";
      type: "string";
      value: '"idl.url"';
    },
    {
      name: "dataTypeLength";
      type: "u64";
      value: "16";
    },
    {
      name: "dataTypeMetaJson";
      type: "string";
      value: '"meta.json"';
    },
    {
      name: "dataTypeMetaUrl";
      type: "string";
      value: '"meta.url"';
    },
    {
      name: "metadataAccountSize";
      type: "u64";
      value: "92";
    }
  ];
};
