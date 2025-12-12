import type { EthereumClient } from "../../../client.ts";
import { NetRpcMethods, RpcMethods } from "../types.ts";
import { listening } from "./listening.ts";
import { peerCount } from "./peer-count.ts";
import { version } from "./version.ts";

export const createNetRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof NetRpcMethods> => {
	return {
		net_version: version(client),
		net_listening: listening(client),
		net_peerCount: peerCount(client),
	};
};
