import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { toJSONRPCBlock } from "./helpers.ts";
import { getBlockByNumberSchema } from "./schema.ts";

export const getBlockByNumber = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getBlockByNumberSchema,
		async (params: [string, boolean], _c) => {
			const [blockOpt, includeTransactions] = params;
			if (blockOpt === "pending") {
				return safeError(new Error(`"pending" is not yet supported`));
			}
			try {
				const block = await getBlockByOption(blockOpt, chain);
				const response = await toJSONRPCBlock(
					block,
					chain,
					includeTransactions,
				);
				return safeResult(response);
			} catch {
				return safeResult(null);
			}
		},
	);
};
