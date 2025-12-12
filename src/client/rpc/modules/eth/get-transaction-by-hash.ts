import type { PrefixedHexString } from "../../../../utils/index.ts";
import { hexToBytes } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { ReceiptsManager } from "../../../execution/receipt.ts";
import type { TxIndex } from "../../../execution/txIndex.ts";
import type { FullEthereumService } from "../../../service";
import { toJSONRPCTx } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getTransactionByHashSchema } from "./schema.ts";

export const getTransactionByHash = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const txIndex: TxIndex | undefined = service.execution?.txIndex;
	return createRpcMethod(
		getTransactionByHashSchema,
		async (params: [PrefixedHexString], _c) => {
			const [txHash] = params;
			if (!txIndex) return safeError(new Error("missing txIndex"));
			const txHashIndex = await txIndex.getIndex(hexToBytes(txHash));
			if (!txHashIndex) return safeResult(null);
			const [blockHash, txIdx] = txHashIndex;
			const block = await chain.getBlock(blockHash);
			const tx = block.transactions[txIdx];
			return safeResult(toJSONRPCTx(tx, block, txIdx));
		},
	);
};
