import type { AbstractLevel } from "abstract-level";
import type { Blockchain } from "../../blockchain";
import type { GenesisState } from "../../chain-config";
import type { Chain } from "../blockchain";
import type { Config } from "../config/index.ts";
import type { ExecutionService } from "../execution/execution-service.ts";
import type { NetworkService } from "../net/network-service.ts";
import type { TxFetcher } from "../sync/fetcher/txFetcher.ts";
import type { MultiaddrLike } from "../types.ts";

/**
 * Options for initializing an ExecutionNode
 */
export interface ExecutionNodeInitOptions {
	/** Client configuration */
	config: Config;

	/** Custom blockchain (optional) */
	blockchain?: Blockchain;

	/**
	 * Database to store blocks and metadata.
	 * Should be an abstract-leveldown compliant store.
	 *
	 * Default: Database created by the Blockchain class
	 */
	chainDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/**
	 * Database to store the state.
	 * Should be an abstract-leveldown compliant store.
	 *
	 * Default: Database created by the MerklePatriciaTrie class
	 */
	stateDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/**
	 * Database to store tx receipts, logs, and indexes.
	 * Should be an abstract-leveldown compliant store.
	 *
	 * Default: Database created in datadir folder
	 */
	metaDB?: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;

	/* List of bootnodes to use for discovery */
	bootnodes?: MultiaddrLike[];

	/* List of supported clients */
	clientFilter?: string[];

	/* How often to discover new peers */
	refreshInterval?: number;

	/* custom genesisState if any for the chain */
	genesisState?: GenesisState;

	/* Sync retry interval in ms (default: 200) */
	interval?: number;

	/* Protocol timeout in ms (default: 6000) */
	timeout?: number;
}

/**
 * Modules that make up an ExecutionNode (for constructor, following lodestar pattern)
 */
export type ExecutionNodeModules = {
	config: Config;
	chain: Chain;
	network: NetworkService;
	execution: ExecutionService;
	txFetcher: TxFetcher;
	p2pNode: import("../../p2p/libp2p/types.ts").P2PNode;
};
