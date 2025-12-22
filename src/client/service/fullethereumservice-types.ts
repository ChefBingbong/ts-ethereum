import type { AbstractLevel } from "abstract-level";
import type { Chain } from "../blockchain";
import type { Config } from "../config/index.ts";
import type { VMExecution } from "../execution";
import type { PeerPoolLike } from "../net/peerpool-types.ts";
import type { FullSynchronizer } from "../sync";
import type { P2PFullEthereumService } from "./p2p-fullethereumservice.ts";
import type { TxPool } from "./txpool.ts";

/**
 * Common interface for FullEthereumService implementations
 * Now only P2PFullEthereumService is supported
 */
export interface IFullEthereumService {
	pool: PeerPoolLike;
	chain: Chain;
	execution: VMExecution;
	txPool: TxPool;
	synchronizer?: FullSynchronizer;
}

/**
 * Type alias for FullEthereumService implementations
 * Now only P2PFullEthereumService is supported
 */
export type FullEthereumServiceLike = P2PFullEthereumService;

/**
 * Backward compatibility alias
 * @deprecated Use P2PFullEthereumService directly
 */
export type FullEthereumService = P2PFullEthereumService;

export interface ServiceOptions {
	/* Config (should have node property - Config now creates P2PNode automatically) */
	config: Config;

	/* Blockchain (optional - will be created if not provided) */
	chain?: Chain;

	/* Blockchain database */
	chainDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/* State database */
	stateDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/* Meta database (receipts, logs, indexes) */
	metaDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/* Sync retry interval in ms (default: 8000) */
	interval?: number;

	/* Protocol timeout in ms (default: 6000) */
	timeout?: number;
}
