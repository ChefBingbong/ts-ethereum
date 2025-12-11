import type { Block } from "../../../../block/index.ts";
import type { LegacyTx } from "../../../../tx/index.ts";
import { hexToBytes, isHexString } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import { runBlock } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { ReceiptsManager } from "../../../execution/receipt.ts";
import type { FullEthereumService } from "../../../service";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { toJSONRPCReceipt } from "./helpers.ts";
import { getBlockReceiptsSchema } from "./schema.ts";

export const getBlockReceipts = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	const receiptsManager: ReceiptsManager | undefined =
		service.execution?.receiptsManager;
	return createRpcMethod(
		getBlockReceiptsSchema,
		async (params: [string], _c) => {
			const [blockOpt] = params;
			let block: Block;
			try {
				if (isHexString(blockOpt, 64)) {
					block = await chain.getBlock(hexToBytes(blockOpt));
				} else {
					block = await getBlockByOption(blockOpt, chain);
				}
			} catch {
				return safeResult(null);
			}
			const blockHash = block.hash();
			if (!receiptsManager)
				return safeError(new Error("missing receiptsManager"));
			const result = await receiptsManager.getReceipts(blockHash, true, true);
			if (result.length === 0) return safeResult([]);
			const parentBlock = await chain.getBlock(block.header.parentHash);
			const vmCopy = await vm!.shallowCopy();
			const runBlockResult = await runBlock(vmCopy, {
				block,
				root: parentBlock.header.stateRoot,
				skipBlockValidation: true,
			});

			const receipts = await Promise.all(
				result.map(async (r, i) => {
					const tx = block.transactions[i];
					const { totalGasSpent } = runBlockResult.results[i];
					const effectiveGasPrice = (tx as LegacyTx).gasPrice;

					return toJSONRPCReceipt(
						r,
						totalGasSpent,
						effectiveGasPrice,
						block,
						tx,
						i,
						i,
						undefined,
					);
				}),
			);
			return safeResult(receipts);
		},
	);
};

