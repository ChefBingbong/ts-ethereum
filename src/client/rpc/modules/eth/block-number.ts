import { BIGINT_0, bigIntToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { blockNumberSchema } from "./schema.ts";

export const blockNumber = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(blockNumberSchema, async (_params, _c) => {
		return safeResult(bigIntToHex(chain.headers.latest?.number ?? BIGINT_0));
	});
};
