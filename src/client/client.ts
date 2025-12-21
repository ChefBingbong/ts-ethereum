import type { AbstractLevel } from "abstract-level";
import debug from "debug";
import type { Blockchain } from "../blockchain";
import type { GenesisState } from "../chain-config";
import { Chain } from "./blockchain";
import { P2PConfig } from "./p2p-config.ts";
import { P2PFullEthereumService } from "./service/p2p-fullethereumservice.ts";
import type { MultiaddrLike } from "./types.ts";
import { Event } from "./types.ts";
import { getPackageJSON } from "./util";

const log = debug("p2p:client");

export interface P2PEthereumClientOptions {
	/** Client configuration */
	config: P2PConfig;

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
}

/**
 * P2P Ethereum Client - Top-level client using P2P networking
 *
 * Similar to EthereumClient but uses P2PNode instead of RlpxServer
 * and P2PFullEthereumService instead of FullEthereumService.
 *
 * @memberof module:client
 */
export class EthereumClient {
	public config: P2PConfig;
	public chain: Chain;
	public service: P2PFullEthereumService;

	public opened: boolean;
	public started: boolean;

	/**
	 * Main entrypoint for client initialization.
	 *
	 * Safe creation of a Chain object awaiting the initialization
	 * of the underlying Blockchain object.
	 */
	public static async create(options: P2PEthereumClientOptions) {
		log("Creating P2PEthereumClient");
		const chain = await Chain.create(options);
		log("Chain created, instantiating client");
		return new this(chain, options);
	}

	/**
	 * Create new P2P node
	 */
	protected constructor(chain: Chain, options: P2PEthereumClientOptions) {
		log("P2PEthereumClient constructor");
		this.config = options.config;
		this.chain = chain;
		log("Creating P2PFullEthereumService");
		this.service = new P2PFullEthereumService({
			config: this.config,
			chainDB: options.chainDB,
			stateDB: options.stateDB,
			metaDB: options.metaDB,
			chain,
		});
		this.opened = false;
		this.started = false;
		log("P2PEthereumClient created");
	}

	/**
	 * Open node. Must be called before node is started
	 */
	async open() {
		if (this.opened) {
			log("Client already opened");
			return false;
		}
		log("Opening P2PEthereumClient");
		const name = this.config.chainCommon.chainName();
		const chainId = this.config.chainCommon.chainId();
		const packageJSON = getPackageJSON();
		log(
			"Initializing P2P Ethereumjs client version=v%s network=%s chainId=%d",
			packageJSON.version,
			name,
			chainId,
		);
		this.config.logger?.info(
			`Initializing P2P Ethereumjs client version=v${packageJSON.version} network=${name} chainId=${chainId}`,
		);

		// Listen for P2PNode events
		if (this.config.node) {
			log("Setting up P2PNode event listeners");
			this.config.node.addEventListener("peer:connect", (evt) => {
				log("P2PNode peer:connect event");
				this.config.logger?.info(`Peer connected: ${evt.detail}`);
			});

			this.config.node.addEventListener("peer:disconnect", (evt) => {
				log("P2PNode peer:disconnect event");
				this.config.logger?.info(`Peer disconnected: ${evt.detail}`);
			});
		}

		log("Opening service");
		await this.service.open();

		this.opened = true;
		log("P2PEthereumClient opened");
	}

	/**
	 * Starts node and all services and P2PNode.
	 */
	async start() {
		if (this.started) {
			log("Client already started");
			return false;
		}
		log("Starting P2PEthereumClient");
		this.config.logger?.info("Setup networking and services.");

		log("Starting service");
		await this.service.start();

		// Start P2PNode if it exists
		if (this.config.node) {
			log("Starting P2PNode");
			await this.config.node.start();
			const addresses = this.config.node.getMultiaddrs();
			log(
				"P2PNode started, listening on: %s",
				addresses.map((a) => a.toString()).join(", "),
			);
			this.config.logger?.info(
				`P2PNode started, listening on: ${addresses.map((a) => a.toString()).join(", ")}`,
			);
		}

		this.started = true;
		log("P2PEthereumClient started");
	}

	/**
	 * Stops node and all services and P2PNode.
	 */
	async stop() {
		if (!this.started) {
			log("Client not started");
			return false;
		}
		log("Stopping P2PEthereumClient");
		this.config.events.emit(Event.CLIENT_SHUTDOWN);
		log("Stopping service");
		await this.service.stop();

		// Stop P2PNode if it exists
		if (this.config.node) {
			log("Stopping P2PNode");
			await this.config.node.stop();
		}

		this.started = false;
		log("P2PEthereumClient stopped");
	}

	/**
	 * Close node and all services
	 */
	async close() {
		if (!this.opened) {
			log("Client not opened");
			return false;
		}
		log("Closing P2PEthereumClient");
		await this.service.close();
		this.opened = false;
		log("P2PEthereumClient closed");
	}

	/**
	 * Get the P2PNode instance (if it exists)
	 */
	node() {
		return this.config.node;
	}

	server() {
		return this.config.node;
	}

	/**
	 * Get connected peers
	 * @returns Array of peer IDs
	 */
	peers(): string[] {
		return Array.from(this.service.pool.peers.values()).map((peer) => peer.id);
	}

	/**
	 * Get peer count
	 */
	peerCount(): number {
		return this.service.pool.size;
	}
}
