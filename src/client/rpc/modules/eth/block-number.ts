import { BIGINT_0, bigIntToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { ExecutionNode } from "../../../node/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { blockNumberSchema } from "./schema.ts";

export const blockNumber = (node: ExecutionNode) => {
	return createRpcMethod(blockNumberSchema, async (_params, _c) => {
		return safeResult(
			bigIntToHex(node.chain.headers.latest?.number ?? BIGINT_0),
		);
	});
};
