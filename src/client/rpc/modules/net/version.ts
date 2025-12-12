import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { versionSchema } from "./schema.ts";

export const version = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(versionSchema, async (_params, _c) => {
		return safeResult(chain.config.chainCommon.chainId().toString());
	});
};
