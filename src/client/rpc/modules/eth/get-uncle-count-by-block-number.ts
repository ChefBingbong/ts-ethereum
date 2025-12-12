import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { getUncleCountByBlockNumberSchema } from "./schema.ts";

export const getUncleCountByBlockNumber = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getUncleCountByBlockNumberSchema,
		async (params: [string], _c) => {
			const [blockNumberHex] = params;
			const blockNumber = BigInt(blockNumberHex);
			const latest =
				chain.headers.latest?.number ??
				(await chain.getCanonicalHeadHeader()).number;

			if (blockNumber > latest) {
				return safeError(
					new Error("specified block greater than current height"),
				);
			}

			const block = await chain.getBlock(blockNumber);
			return safeResult(block.uncleHeaders.length);
		},
	);
};
