import type { EthereumClient } from "../../../client.ts";
import { AdminRpcMethods, RpcMethods } from "../types.ts";
import { addPeer } from "./add-peer.ts";
import { nodeInfo } from "./node-info.ts";
import { peers } from "./peers.ts";

export const createAdminRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof AdminRpcMethods> => {
	const service = client.service!;
	const dpt = client.service.pool.config.server.dpt;
	return {
		admin_addPeer: addPeer(client, service, dpt),
		admin_nodeInfo: nodeInfo(client, service),
		admin_peers: peers(client),
	};
};
