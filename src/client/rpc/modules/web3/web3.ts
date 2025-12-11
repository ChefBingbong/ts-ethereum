import type { EthereumClient } from "../../../client.ts";
import { clientVersion } from "./client-version.ts";
import { sha3 } from "./sha3.ts";

export const createWeb3RpcMethods = (client: EthereumClient) => {
	return {
		web3_clientVersion: clientVersion(client),
		web3_sha3: sha3(client),
	};
};
