import { addHexPrefix } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { peerCountSchema } from "./schema.ts";

export const peerCount = (client: EthereumClient) => {
	const service = client.service as any;
	const peerPool = service.pool;
	return createRpcMethod(peerCountSchema, async (_params, _c) => {
		return safeResult(addHexPrefix(peerPool.peers.length.toString(16)));
	});
};

