import { hexToBytes, intToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { getBlockTransactionCountByHashSchema } from "./schema.ts";

export const getBlockTransactionCountByHash = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getBlockTransactionCountByHashSchema,
		async (params: [PrefixedHexString], _c) => {
			const [blockHash] = params;
			try {
				const block = await chain.getBlock(hexToBytes(blockHash));
				return safeResult(intToHex(block.transactions.length));
			} catch {
				return safeError(new Error("Unknown block"));
			}
		},
	);
};

