import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { toJSONRPCTx } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { contentSchema } from "./schema.ts";

export const content = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const txpool = service.txPool;
	return createRpcMethod(contentSchema, async (_params, _c) => {
		const pending = new Map();
		// Iterate over both pending and queued pools
		for (const [addr, txs] of txpool.pending.entries()) {
			const pendingForAcct = new Map<bigint, any>();
			for (const tx of txs) {
				pendingForAcct.set(tx.nonce, toJSONRPCTx(tx));
			}
			if (pendingForAcct.size > 0) {
				pending.set("0x" + addr, Object.fromEntries(pendingForAcct));
			}
		}

		const queued = new Map();
		for (const [addr, txs] of txpool.queued.entries()) {
			const queuedForAcct = new Map<bigint, any>();
			for (const tx of txs) {
				queuedForAcct.set(tx.nonce, toJSONRPCTx(tx));
			}
			if (queuedForAcct.size > 0) {
				queued.set("0x" + addr, Object.fromEntries(queuedForAcct));
			}
		}

		return safeResult({
			pending: Object.fromEntries(pending),
			queued: Object.fromEntries(queued),
		});
	});
};
