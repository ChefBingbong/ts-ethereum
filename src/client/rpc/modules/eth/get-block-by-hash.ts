import type { PrefixedHexString } from "../../../../utils/index.ts";
import { hexToBytes } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { toJSONRPCBlock } from "./helpers.ts";
import { getBlockByHashSchema } from "./schema.ts";

export const getBlockByHash = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getBlockByHashSchema,
		async (params: [PrefixedHexString, boolean], _c) => {
			const [blockHash, includeTransactions] = params;
			try {
				const block = await chain.getBlock(hexToBytes(blockHash));
				return safeResult(
					await toJSONRPCBlock(block, chain, includeTransactions),
				);
			} catch {
				return safeResult(null);
			}
		},
	);
};

