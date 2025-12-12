import { createBlock } from "../../../../block/index.ts";
import { createTx } from "../../../../tx/index.ts";
import {
	BIGINT_1,
	createAddressFromString,
	createZeroAddress,
} from "../../../../utils/index.ts";
import { EthereumJSErrorWithoutCode } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import { runTx } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import type { RPCTx } from "../../types.ts";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { estimateGasSchema } from "./schema.ts";

export const estimateGas = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	return createRpcMethod(
		estimateGasSchema,
		async (params: [RPCTx, string?], _c) => {
			const [transaction, blockOpt] = params;
			const block = await getBlockByOption(blockOpt ?? "latest", chain);

			if (vm === undefined) {
				throw EthereumJSErrorWithoutCode("missing vm");
			}
			const vmCopy = await vm.shallowCopy();
			await vmCopy.stateManager.setStateRoot(block.header.stateRoot);

			if (transaction.gas === undefined) {
				const latest = await chain.getCanonicalHeadHeader();
				transaction.gas = latest.gasLimit as any;
			}

			const txData = {
				...transaction,
				gasLimit: transaction.gas,
			};

			const blockToRunOn = createBlock(
				{
					header: {
						parentHash: block.hash(),
						number: block.header.number + BIGINT_1,
						timestamp: block.header.timestamp + BIGINT_1,
					},
				},
				{ common: vmCopy.common },
			);

			const tx = createTx(txData, { common: vmCopy.common, freeze: false });

			const from =
				transaction.from !== undefined
					? createAddressFromString(transaction.from)
					: createZeroAddress();
			tx.getSenderAddress = () => from;

			const { totalGasSpent } = await runTx(vmCopy, {
				tx,
				skipNonce: true,
				skipBalance: true,
				skipBlockGasLimitValidation: true,
				block: blockToRunOn,
			});
			return safeResult(`0x${totalGasSpent.toString(16)}`);
		},
	);
};
