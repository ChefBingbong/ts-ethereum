import type { PrefixedHexString } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { getBlockByOption, toJSONRPCTx } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getTransactionByBlockNumberAndIndexSchema } from "./schema.ts";

export const getTransactionByBlockNumberAndIndex = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getTransactionByBlockNumberAndIndexSchema,
		async (params: [PrefixedHexString, string], _c) => {
			try {
				const [blockNumber, txIndexHex] = params;
				const txIndex = parseInt(txIndexHex, 16);
				const block = await getBlockByOption(blockNumber, chain);
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

