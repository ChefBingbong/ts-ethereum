import type { Proof } from "../../../../state-manager/index.ts";
import {
	getMerkleStateProof,
	MerkleStateManager,
} from "../../../../state-manager/index.ts";
import {
	createAddressFromString,
	hexToBytes,
	setLengthLeft,
} from "../../../../utils/index.ts";
import { EthereumJSErrorWithoutCode } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { VM } from "../../../../vm/index.ts";
import type { PrefixedHexString } from "../../../../utils/index.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service";
import { getBlockByOption } from "../../helpers.ts";
import { createRpcMethod } from "../../validation.ts";
import { getProofSchema } from "./schema.ts";

export const getProof = (client: EthereumClient) => {
	const service = client.service as FullEthereumService;
	const chain = service.chain;
	const vm: VM | undefined = service.execution?.vm;
	return createRpcMethod(
		getProofSchema,
		async (
			params: [PrefixedHexString, PrefixedHexString[], PrefixedHexString],
			_c,
		) => {
			const [addressHex, slotsHex, blockOpt] = params;
			const block = await getBlockByOption(blockOpt, chain);

			if (vm === undefined) {
				return safeError(EthereumJSErrorWithoutCode("missing vm"));
			}

			const vmCopy = await vm.shallowCopy();
			await vmCopy.stateManager.setStateRoot(block.header.stateRoot);

			const address = createAddressFromString(addressHex);
			const slots = slotsHex.map((slotHex) =>
				setLengthLeft(hexToBytes(slotHex), 32),
			);
			let proof: Proof;
			if (vmCopy.stateManager instanceof MerkleStateManager) {
				proof = await getMerkleStateProof(vmCopy.stateManager, address, slots);
			} else {
				return safeError(
					EthereumJSErrorWithoutCode(
						"getProof RPC method not supported with the StateManager provided",
					),
				);
			}

			return safeResult(proof);
		},
	);
};
