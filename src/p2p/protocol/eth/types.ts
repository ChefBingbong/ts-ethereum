import type { BlockHeader } from "../../../block";
import type { TypedTransaction } from "../../../tx";
import type { TxReceipt } from "../../../vm";
import type { Chain } from "../../../client/blockchain";
import type { VMExecution } from "../../../client/execution";
import type { Config } from "../../../client/config";
import type { RLPxConnection } from "../../transport/rlpx/connection";

/**
 * ETH Protocol Handler Options
 */
export interface EthHandlerOptions {
	config: Config;
	chain: Chain;
	execution: VMExecution;
	rlpxConnection: RLPxConnection;
}

/**
 * ETH Status message
 */
export interface EthStatus {
	chainId: bigint;
	td: bigint;
	bestHash: Uint8Array;
	genesisHash: Uint8Array;
	forkId?: [Uint8Array, Uint8Array]; // [forkHash, nextFork]
}

/**
 * Request resolver for async request/response matching
 */
export interface RequestResolver {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}
