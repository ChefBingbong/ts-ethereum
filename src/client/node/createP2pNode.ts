import { defaultLogger } from "@libp2p/logger";
import { P2PNode } from "../../p2p/libp2p/node.ts";
import { rlpx } from "../../p2p/transport/rlpx/index.ts";
import { ConfigOptions } from "../config/types.ts";
import { dptDiscovery } from "../net/discovery/dpt-discovery.ts";
import { ETH } from "../net/protocol/eth/eth.ts";
import { P2PNode as P2PNodeType } from "../p2p/libp2p/types.ts";

export function createP2PNodeFromConfig(options: ConfigOptions): P2PNodeType {
	const kadDiscovery = [];
	const componentLogger = defaultLogger();

	if (options.discV4) {
		kadDiscovery.push(
			dptDiscovery({
				privateKey: options.key,
				bindAddr: options.extIP ?? "127.0.0.1",
				bindPort: options.port,
				bootstrapNodes: [...options.bootnodes],
				autoDial: true,
				autoDialBootstrap: true,
			}),
		);
	}

	const node = new P2PNode({
		privateKey: options.key,
		peerDiscovery: kadDiscovery,
		maxConnections: options.maxPeers,
		logger: componentLogger,
		addresses: {
			listen: [
				options.extIP
					? `/ip4/${options.extIP}/tcp/${options.port}`
					: `/ip4/0.0.0.0/tcp/${options.port}`,
			],
		},
		transports: [
			rlpx({
				privateKey: options.key,
				capabilities: [ETH.eth68],
				common: options.common,
				timeout: 10000,
				maxConnections: options.maxPeers,
			}),
		],
	});

	return node;
}
