import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { logLevels, verbositySchema } from "./schema.ts";

export const verbosity = (client: EthereumClient) =>
	createRpcMethod(verbositySchema, async (params: [number], _c) => {
		const [level] = params;
		client.config.logger?.configure({ level: logLevels[level] });
		return safeResult(`level: ${client.config.logger?.level}`);
	});
