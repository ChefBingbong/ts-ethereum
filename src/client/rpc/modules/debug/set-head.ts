import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { INTERNAL_ERROR, INVALID_PARAMS } from "../../error-code.ts";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { setHeadSchema } from "./schema.ts";

export const setHead = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	return createRpcMethod(setHeadSchema, async (params: [string], _c) => {
		const [blockOpt] = params;
		if (blockOpt === "pending") {
			const err = new Error(`"pending" is not supported`);
			(err as any).code = INVALID_PARAMS;
			return safeError(err);
		}

		const block = await getBlockByOption(blockOpt, chain);
		try {
			await service.execution.setHead([block]);
			return safeResult(null);
		} catch (error: any) {
			const err = error instanceof Error ? error : new Error(String(error));
			if (!(err as any).code) {
				(err as any).code = INTERNAL_ERROR;
			}
			return safeError(err);
		}
	});
};
