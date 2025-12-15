import { intToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { protocolVersionSchema } from "./schema.ts";

export const protocolVersion = (client: EthereumClient) => {
	// ETH protocol version is now 68 (hard-coded as we use the new RlpxConnection system)
	const ethVersion = 68;
	return createRpcMethod(protocolVersionSchema, async (_params, _c) => {
		return safeResult(intToHex(ethVersion));
	});
};
