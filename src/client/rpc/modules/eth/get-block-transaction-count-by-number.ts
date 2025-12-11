import { intToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getBlockTransactionCountByNumberSchema } from "./schema.ts";

export const getBlockTransactionCountByNumber = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(
		getBlockTransactionCountByNumberSchema,
		async (params: [string], _c) => {
			const [blockOpt] = params;
			const block = await getBlockByOption(blockOpt, chain);
			return safeResult(intToHex(block.transactions.length));
		},
	);
};

