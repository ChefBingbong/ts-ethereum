import { keccak256 } from "ethereum-cryptography/keccak.js";
import { bytesToHex, hexToBytes } from "../../../../utils/index.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { sha3Schema } from "./schema.ts";

export const sha3 = (_client: EthereumClient) =>
	createRpcMethod(sha3Schema, async (params: [PrefixedHexString], _c) => {
		const hexEncodedDigest = bytesToHex(keccak256(hexToBytes(params[0])));
		return safeResult(hexEncodedDigest);
	});

