import type { EthereumClient } from "../../../client.ts";
import { AdminRpcMethods, RpcMethods } from "../types.ts";
import { addPeer } from "./add-peer.ts";
import { nodeInfo } from "./node-info.ts";
import { peers } from "./peers.ts";

export const createAdminRpcMethods = (
	client: EthereumClient,
): RpcMethods<typeof AdminRpcMethods> => {
	const service = client.service!;
	// P2PNode handles peer discovery internally - DPT is not directly accessible
	// TODO: Update addPeer to work with P2PNode if needed
	const dpt = null as any; // DPT not available in P2P architecture
	return {
		admin_addPeer: addPeer(client, service, dpt),
		admin_nodeInfo: nodeInfo(client, service),
		admin_peers: peers(client),
	};
};
