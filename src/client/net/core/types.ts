import type { P2PNode } from "../../../p2p/libp2p/types.ts";
import type { Chain } from "../../blockchain/chain.ts";
import type { Config } from "../../config/index.ts";
import type { VMExecution } from "../../execution";

/**
 * Options for initializing NetworkCore
 */
export interface NetworkCoreOptions {
	/* Config */
	config: Config;

	/* P2PNode instance */
	node: P2PNode;

	/* Chain instance (optional, for STATUS exchange) */
	chain?: Chain;

	/* VMExecution instance (required, for ETH handler) */
	execution: VMExecution;
}
