import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { coinbaseSchema } from "./schema.ts";

export const coinbase = (client: EthereumClient) =>
	createRpcMethod(coinbaseSchema, async (_params, _c) => {
		const cb = client.config.minerCoinbase;
		if (cb === undefined) {
			return safeError(new Error("Coinbase must be explicitly specified"));
		}
		return safeResult(cb.toString());
	});
