import type { PrefixedHexString } from "../../../../utils/index.ts";
import { hexToBytes } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { toJSONRPCTx } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getTransactionByBlockHashAndIndexSchema } from "./schema.ts";

export const getTransactionByBlockHashAndIndex = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getTransactionByBlockHashAndIndexSchema,
		async (params: [PrefixedHexString, string], _c) => {
			try {
				const [blockHash, txIndexHex] = params;
				const txIndex = parseInt(txIndexHex, 16);
				const block = await chain.getBlock(hexToBytes(blockHash));
				if (block.transactions.length <= txIndex) {
					return safeResult(null);
				}

				const tx = block.transactions[txIndex];
				return safeResult(toJSONRPCTx(tx, block, txIndex));
			} catch (error: any) {
				return safeError(error);
			}
		},
	);
};

