import {
	BIGINT_0,
	BIGINT_1,
	bytesToHex,
	hexToBytes,
} from "../../../../utils/index.ts";
import { createTxFromRLP } from "../../../../tx/index.ts";
import type { TypedTransaction } from "../../../../tx/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { createRpcMethod } from "../../validation.ts";
import { sendRawTransactionSchema } from "./schema.ts";

export const sendRawTransaction = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	return createRpcMethod(
		sendRawTransactionSchema,
		async (params: [PrefixedHexString], _c) => {
			const [serializedTx] = params;

			const { syncTargetHeight } = client.config;
			if (!client.config.synchronized) {
				return safeError(
					new Error(
						"client is not aware of the current chain height yet (give sync some more time)",
					),
				);
			}
			const chainHeight = client.chain.headers.height;
			let txTargetHeight = syncTargetHeight ?? BIGINT_0;
			if (txTargetHeight <= chainHeight) {
				txTargetHeight = chainHeight + BIGINT_1;
			}
			const common = client.config.chainCommon.copy();

			let tx: TypedTransaction;
			try {
				const txBuf = hexToBytes(serializedTx);
				tx = createTxFromRLP(txBuf, { common });
			} catch (e: any) {
				return safeError(
					new Error(`serialized tx data could not be parsed (${e.message})`),
				);
			}

			if (!tx.isSigned()) {
				return safeError(new Error("tx needs to be signed"));
			}

			const { txPool } = service as FullEthereumService;

			try {
				await txPool.add(tx, true);
			} catch (error: any) {
				return safeError(new Error(error.message ?? error.toString()));
			}

			const peerPool = service.pool;
			if (
				peerPool.peers.length === 0 &&
				!client.config.mine &&
				client.config.isSingleNode === false
			) {
				return safeError(new Error("no peer connection available"));
			}

			txPool.broadcastTransactions([tx]);

			return safeResult(bytesToHex(tx.hash()));
		},
	);
};
