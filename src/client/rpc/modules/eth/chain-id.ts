import { bigIntToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { chainIdSchema } from "./schema.ts";

export const chainId = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(chainIdSchema, async (_params, _c) => {
		const chainId = chain.config.chainCommon.chainId();
		return safeResult(bigIntToHex(chainId));
	});
};

