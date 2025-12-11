import { getClientVersion } from "../../../util/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { clientVersionSchema } from "./schema.ts";

export const clientVersion = (_client: EthereumClient) =>
	createRpcMethod(clientVersionSchema, async (_params, _c) => {
		return safeResult(getClientVersion());
	});

