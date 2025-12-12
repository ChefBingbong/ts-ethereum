import { bytesToHex } from "../../../../utils/index.ts";
import { EthereumJSErrorWithoutCode } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import { encodeReceipt } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getRawReceiptsSchema } from "./schema.ts";

export const getRawReceipts = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	return createRpcMethod(getRawReceiptsSchema, async (params: [string], _c) => {
		const [blockOpt] = params;
		if (!service.execution.receiptsManager)
			return safeError(EthereumJSErrorWithoutCode("missing receiptsManager"));
		const block = await getBlockByOption(blockOpt, chain);
		const receipts = await service.execution.receiptsManager.getReceipts(
			block.hash(),
			true,
			true,
		);
		return safeResult(
			receipts.map((r) => bytesToHex(encodeReceipt(r, r.txType))),
		);
	});
};
