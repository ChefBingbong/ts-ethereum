import { BIGINT_0, bigIntToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { ExecutionNode } from "../../../node/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { syncingSchema } from "./schema.ts";

export const syncing = (node: ExecutionNode) => {
	const chain = node.chain;
	return createRpcMethod(syncingSchema, async (_params, _c) => {
		if (node.config.synchronized) {
			return safeResult(false);
		}

		const currentBlockHeader =
			chain.headers?.latest ?? (await chain.getCanonicalHeadHeader());
		const currentBlock = bigIntToHex(currentBlockHeader.number);

		const synchronizer = node.synchronizer;
		if (!synchronizer) {
			return safeResult(false);
		}
		const syncTargetHeight = node.synchronizer.syncTargetHeight;
		const startingBlock = bigIntToHex(synchronizer.startingBlock);

		let highestBlock: string | undefined;
		if (typeof syncTargetHeight === "bigint" && syncTargetHeight !== BIGINT_0) {
			highestBlock = bigIntToHex(syncTargetHeight);
		} else {
			const bestPeer = await synchronizer.best();
			if (!bestPeer) {
				return safeError(new Error("no peer available for synchronization"));
			}
			const highestBlockHeader = await bestPeer.latest();
			if (!highestBlockHeader) {
				return safeError(new Error("highest block header unavailable"));
			}
			highestBlock = bigIntToHex(highestBlockHeader.number);
		}

		return safeResult({ startingBlock, currentBlock, highestBlock });
	});
};
