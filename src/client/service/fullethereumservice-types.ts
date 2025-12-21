import type { Chain } from "../blockchain";
import type { VMExecution } from "../execution";
import type { PeerPoolLike } from "../net/peerpool-types.ts";
import type { FullSynchronizer } from "../sync";
import type { TxPool } from "./txpool.ts";

import { P2PFullEthereumService } from "./p2p-fullethereumservice.ts";

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

