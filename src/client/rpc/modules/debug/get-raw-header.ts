import { bytesToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getRawHeaderSchema } from "./schema.ts";

export const getRawHeader = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(getRawHeaderSchema, async (params: [string], _c) => {
		const [blockOpt] = params;
		const block = await getBlockByOption(blockOpt, chain);
		return safeResult(bytesToHex(block.header.serialize()));
	});
};

