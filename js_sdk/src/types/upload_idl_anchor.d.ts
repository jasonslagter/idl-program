/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/upload_idl_anchor.json`.
 */
export type UploadIdlAnchor = {
    "address": "idLB41CuMPpWZmQGGxpsxbyGDWWzono4JnFLJxQakrE";
    "metadata": {
        "name": "uploadIdlAnchor";
        "version": "0.1.0";
        "spec": "0.1.0";
        "description": "Created with Anchor";
    };
    "instructions": [
        {
            "name": "closeBuffer";
            "discriminator": [
                46,
                114,
                179,
                58,
                57,
                45,
                194,
                172
            ];
            "accounts": [
                {
                    "name": "buffer";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "createBuffer";
            "discriminator": [
                175,
                76,
                101,
                74,
                224,
                249,
                104,
                170
            ];
            "accounts": [
                {
                    "name": "buffer";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "initialize";
            "discriminator": [
                175,
                175,
                109,
                31,
                13,
                152,
                155,
                237
            ];
            "accounts": [
                {
                    "name": "idl";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "arg";
                                "path": "seed";
                            },
                            {
                                "kind": "account";
                                "path": "programId";
                            }
                        ];
                    };
                },
                {
                    "name": "signer";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                },
                {
                    "name": "programId";
                },
                {
                    "name": "programData";
                }
            ];
            "args": [
                {
                    "name": "seed";
                    "type": "string";
                }
            ];
        },
        {
            "name": "resize";
            "discriminator": [
                74,
                27,
                74,
                155,
                56,
                134,
                175,
                125
            ];
            "accounts": [
                {
                    "name": "idl";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "arg";
                                "path": "seed";
                            },
                            {
                                "kind": "account";
                                "path": "programId";
                            }
                        ];
                    };
                },
                {
                    "name": "signer";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                },
                {
                    "name": "programId";
                }
            ];
            "args": [
                {
                    "name": "len";
                    "type": "u16";
                },
                {
                    "name": "seed";
                    "type": "string";
                }
            ];
        },
        {
            "name": "setAuthority";
            "discriminator": [
                133,
                250,
                37,
                21,
                110,
                163,
                26,
                121
            ];
            "accounts": [
                {
                    "name": "idl";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                    "relations": [
                        "idl"
                    ];
                }
            ];
            "args": [
                {
                    "name": "newAuthority";
                    "type": "pubkey";
                }
            ];
        },
        {
            "name": "setBuffer";
            "discriminator": [
                13,
                212,
                241,
                0,
                78,
                93,
                17,
                51
            ];
            "accounts": [
                {
                    "name": "buffer";
                    "writable": true;
                },
                {
                    "name": "idl";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "arg";
                                "path": "seed";
                            },
                            {
                                "kind": "account";
                                "path": "programId";
                            }
                        ];
                    };
                },
                {
                    "name": "authority";
                    "signer": true;
                    "relations": [
                        "idl"
                    ];
                },
                {
                    "name": "programId";
                }
            ];
            "args": [
                {
                    "name": "seed";
                    "type": "string";
                }
            ];
        },
        {
            "name": "writeBuffer";
            "discriminator": [
                164,
                194,
                69,
                154,
                75,
                169,
                228,
                85
            ];
            "accounts": [
                {
                    "name": "buffer";
                    "writable": true;
                },
                {
                    "name": "signer";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "idlData";
                    "type": "bytes";
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "idlAccount";
            "discriminator": [
                140,
                36,
                166,
                2,
                103,
                197,
                33,
                164
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "wrongAuthority";
            "msg": "Only the program upgrade authority can initialize the IDL account";
        },
        {
            "code": 6001;
            "name": "notExecutable";
            "msg": "The program account is not executable";
        },
        {
            "code": 6002;
            "name": "notAProgram";
            "msg": "The program account is not a program. Not owned by the BPF loader";
        },
        {
            "code": 6003;
            "name": "shouldBeProgramAccount";
            "msg": "The program account should not be a program data account";
        }
    ];
    "types": [
        {
            "name": "idlAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "dataLen";
                        "type": "u32";
                    }
                ];
            };
        }
    ];
};
