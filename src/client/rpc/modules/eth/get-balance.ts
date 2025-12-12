import {
	BIGINT_0,
	bigIntToHex,
	createAddressFromString,
} from "../../../../utils/index.ts";
import { EthereumJSErrorWithoutCode } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getBalanceSchema } from "./schema.ts";

export const getBalance = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	return createRpcMethod(
		getBalanceSchema,
		async (params: [string, string], _c) => {
			const [addressHex, blockOpt] = params;
			const address = createAddressFromString(addressHex);
			const block = await getBlockByOption(blockOpt, chain);

			if (vm === undefined) {
				return safeError(EthereumJSErrorWithoutCode("missing vm"));
			}

			const vmCopy = await vm.shallowCopy();
			await vmCopy.stateManager.setStateRoot(block.header.stateRoot);
			const account = await vmCopy.stateManager.getAccount(address);
			if (account === undefined) {
				return safeResult("0x0");
			}
			return safeResult(bigIntToHex(account.balance));
		},
	);
};
