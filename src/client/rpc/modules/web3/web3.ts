import type { EthereumClient } from "../../../client.ts";
import { RpcMethods, Web3RpcMethods } from "../types.ts";
import { clientVersion } from "./client-version.ts";
import { sha3 } from "./sha3.ts";

export const createWeb3RpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof Web3RpcMethods> => {
	return {
		web3_clientVersion: clientVersion(client),
		web3_sha3: sha3(client),
	};
};
