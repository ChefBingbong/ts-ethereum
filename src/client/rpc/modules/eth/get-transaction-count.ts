import { BIGINT_0, bigIntToHex, createAddressFromString } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getTransactionCountSchema } from "./schema.ts";

export const getTransactionCount = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	return createRpcMethod(
		getTransactionCountSchema,
		async (params: [string, string], _c) => {
			const [addressHex, blockOpt] = params;
			let block;
			if (blockOpt !== "pending")
				block = await getBlockByOption(blockOpt, chain);
			else block = await getBlockByOption("latest", chain);

			if (vm === undefined) {
				return safeError(new Error("missing vm"));
			}

			const vmCopy = await vm.shallowCopy();
			await vmCopy.stateManager.setStateRoot(block.header.stateRoot);

			const address = createAddressFromString(addressHex);
			const account = await vmCopy.stateManager.getAccount(address);
			if (account === undefined) {
				return safeResult("0x0");
			}

			let pendingTxsCount = BIGINT_0;

			if (blockOpt === "pending") {
				const txPool = service.txPool;
				const addr = addressHex.slice(2).toLowerCase();
				const pendingTxs = txPool.pending.get(addr)?.length ?? 0;
				const queuedTxs = txPool.queued.get(addr)?.length ?? 0;
				pendingTxsCount = BigInt(pendingTxs + queuedTxs);
			}
			return safeResult(bigIntToHex(account.nonce + pendingTxsCount));
		},
	);
};

