import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { listeningSchema } from "./schema.ts";

export const listening = (client: EthereumClient) =>
	createRpcMethod(listeningSchema, async (_params, _c) => {
		return safeResult(client.opened);
	});
