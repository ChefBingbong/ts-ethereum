import { bytesToHex, hexToBytes } from "../../../../utils/index.ts";
import { EthereumJSErrorWithoutCode } from "../../../../utils/index.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { createRpcMethod } from "../../validation.ts";
import { getRawTransactionSchema } from "./schema.ts";

export const getRawTransaction = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	return createRpcMethod(
		getRawTransactionSchema,
		async (params: [PrefixedHexString], _c) => {
			const [txHash] = params;
			if (!service.execution.receiptsManager)
				return safeError(EthereumJSErrorWithoutCode("missing receiptsManager"));
			if (!service.execution.txIndex)
				return safeError(EthereumJSErrorWithoutCode("missing txIndex"));
			const txHashIndex = await service.execution.txIndex.getIndex(
				hexToBytes(txHash),
			);
			if (!txHashIndex) return safeResult(null);
			const [blockHash, txIndex] = txHashIndex;
			const block = await chain.getBlock(blockHash);
			const tx = block.transactions[txIndex];
			return safeResult(bytesToHex(tx.serialize()));
		},
	);
};

