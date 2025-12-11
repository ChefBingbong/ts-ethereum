import type { LegacyTx } from "../../../../tx/index.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import { equalsBytes, hexToBytes } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import { runBlock } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { ReceiptsManager } from "../../../execution/receipt.ts";
import type { TxIndex } from "../../../execution/txIndex.ts";
import type { FullEthereumService } from "../../../service";
import { createRpcMethod } from "../../validation.ts";
import { toJSONRPCReceipt } from "./helpers.ts";
import { getTransactionReceiptSchema } from "./schema.ts";

export const getTransactionReceipt = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	const receiptsManager: ReceiptsManager | undefined =
		service.execution?.receiptsManager;
	const txIndex: TxIndex | undefined = service.execution?.txIndex;
	return createRpcMethod(
		getTransactionReceiptSchema,
		async (params: [PrefixedHexString], _c) => {
			try {
				const [txHash] = params;

				if (!receiptsManager)
					return safeError(new Error("missing receiptsManager"));
				if (!txIndex) return safeError(new Error("missing txIndex"));
				if (!vm) return safeError(new Error("missing vm"));

				const txHashIndex = await txIndex.getIndex(hexToBytes(txHash));
				if (!txHashIndex) return safeResult(null);

				const result =
					await receiptsManager.getReceiptByTxHashIndex(txHashIndex);
				if (!result) return safeResult(null);

				const [receipt, blockHash, txIdx, logIndex] = result;
				const block = await chain.getBlock(blockHash);
				const blockByNumber = await chain.getBlock(block.header.number);
				if (!equalsBytes(blockByNumber.hash(), block.hash())) {
					return safeResult(null);
				}

				const parentBlock = await chain.getBlock(block.header.parentHash);
				const tx = block.transactions[txIdx];
				const effectiveGasPrice = (tx as LegacyTx).gasPrice;

				const vmCopy = await vm.shallowCopy();
				const runBlockResult = await runBlock(vmCopy, {
					block,
					root: parentBlock.header.stateRoot,
					skipBlockValidation: true,
				});

				const { totalGasSpent } = runBlockResult.results[txIdx];
				const jsonRpcReceipt = await toJSONRPCReceipt(
					receipt,
					totalGasSpent,
					effectiveGasPrice,
					block,
					tx,
					txIdx,
					logIndex,
					undefined,
				);
				return safeResult(jsonRpcReceipt);
			} catch (error) {
				return safeError(error as Error);
			}
		},
	);
};
