import type { AbstractLevel } from "abstract-level";
import debug from "debug";
import { Chain } from "../blockchain";
import type { Config } from "../config.ts";
import { VMExecution } from "../execution/vmexecution.ts";
import { P2PPeerPool } from "../net/p2p-peerpool.ts";
import type { Peer } from "../net/peer/peer.ts";
import type { Synchronizer } from "../sync";
import { Event } from "../types.ts";
import { getV8Engine, type V8Engine } from "../util";

const log = debug("service");

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

/**
 * Base class for all services
 * Uses P2PPeerPool for libp2p-style networking
 *
 * @memberof module:service
 */
export class Service {
	public config: Config;
	public execution: VMExecution;
	public opened: boolean;
	public running: boolean;
	public pool: P2PPeerPool;
	public chain: Chain;
	public interval: number;
	public timeout: number;
	public synchronizer?: Synchronizer;

	// A handle to v8Engine lib for mem stats, assigned on open if running in node
	private v8Engine: V8Engine | null = null;

	/**
	 * Interval for client stats output (e.g. memory) (in ms)
	 * for debug log level
	 *
	 * (for info there will be somewhat reduced output)
	 */
	private STATS_INTERVAL = 1000 * 30; // 30 seconds

	/**
	 * Shutdown the client when memory threshold is reached (in percent)
	 *
	 */
	private MEMORY_SHUTDOWN_THRESHOLD = 92;

	private _statsInterval: NodeJS.Timeout | undefined; /* global NodeJS */
	private _statsCounter = 0;
	/**
	 * Create new service and associated peer pool
	 */
	constructor(options: ServiceOptions) {
		log("Creating Service");
		this.config = options.config;

		this.opened = false;
		this.running = false;

		// P2PPeerPool requires a P2PNode instance from P2PConfig
		const p2pConfig = this.config as any;
		if (!p2pConfig.node) {
			log("ERROR: P2PConfig missing node property");
			throw new Error(
				"Service requires Config with node property. Config now creates P2PNode automatically.",
			);
		}

		//@ts-expect-error TODO replace with async create constructor
		this.chain = options.chain ?? new Chain(options);

		this.execution = new VMExecution({
			config: options.config,
			stateDB: options.stateDB,
			metaDB: options.metaDB,
			chain: this.chain,
		});
		log("Creating P2PPeerPool");
		this.pool = new P2PPeerPool({
			config: this.config,
			node: p2pConfig.node,
			chain: this.chain, // Pass chain for STATUS exchange
			execution: this.execution,
		});

		this.config.events.on(
			Event.PROTOCOL_MESSAGE,
			async (message, protocol, peer) => {
				if (this.running) {
					try {
						const msgName = (message as any)?.name || "unknown";
						this.config.logger?.info(
							`📨 PROTOCOL_MESSAGE: ${msgName} from peer ${peer?.id?.slice(0, 8) || "null"}`,
						);
						await this.handle(message, protocol, peer);
					} catch (error: any) {
						const msgName = (message as any)?.name || "unknown";
						this.config.logger?.error(
							`Error handling message (${protocol}:${msgName}): ${error.message}`,
						);
					}
				} else {
					const msgName = (message as any)?.name || "unknown";
					this.config.logger?.debug(
						`Ignoring PROTOCOL_MESSAGE (service not running): ${msgName}`,
					);
				}
			},
		);

		// this.chain = options.chain ?? new Chain(options);
		this.interval = options.interval ?? 200;
		this.timeout = options.timeout ?? 6000;
		this.opened = false;
		this.running = false;
	}

	/**
	 * Service name
	 */
	get name() {
		return "eth";
	}

	/**
	 * Returns all protocols required by this service
	 * For P2P services, protocols are handled at the transport level (RLPx)
	 * so we return an empty array (no server.addProtocols() call needed)
	 */
	get protocols(): any[] {
		return [];
	}

	/**
	 * Open service. Must be called before service is running
	 */
	async open() {
		if (this.opened) {
			log("Service already opened");
			return false;
		}

		log("Opening Service");
		// For P2P services, protocols are handled at transport level (RLPx)
		// No need to add protocols to server like in the old Service class

		this.config.events.on(Event.POOL_PEER_BANNED, (peer) => {
			log("Peer banned: %s", peer.id.slice(0, 8));
			this.config.logger?.debug(`Peer banned: ${peer}`);
		});
		this.config.events.on(Event.POOL_PEER_ADDED, (peer) => {
			log("Peer added: %s", peer.id.slice(0, 8));
			this.config.logger?.debug(`Peer added: ${peer}`);
		});
		this.config.events.on(Event.POOL_PEER_REMOVED, (peer) => {
			log("Peer removed: %s", peer.id.slice(0, 8));
			this.config.logger?.debug(`Peer removed: ${peer}`);
		});

		await this.pool.open();
		await this.chain.open();
		await this.synchronizer?.open();
		this.opened = true;
		log("Service opened");
		return true;
	}

	/**
	 * Close service.
	 */
	async close() {
		if (!this.opened) {
			log("Service not opened");
			return false;
		}
		log("Closing Service");
		if (this.opened) {
			await this.pool.close();
		}
		this.opened = false;
		log("Service closed");
		return true;
	}

	/**
	 * Start service
	 */
	async start(): Promise<boolean> {
		if (this.running) {
			log("Service already running");
			return false;
		}
		log("Starting Service");
		await this.pool.start();
		void this.synchronizer?.start();
		if (this.v8Engine === null) {
			this.v8Engine = await getV8Engine();
		}

		this._statsInterval = setInterval(
			await this.stats.bind(this),
			this.STATS_INTERVAL,
		);
		this.running = true;
		this.config.logger?.info(`Started ${this.name} service.`);
		log("Service started");
		return true;
	}

	/**
	 * Stop service
	 */
	async stop(): Promise<boolean> {
		if (!this.running) {
			log("Service not running");
			return false;
		}
		log("Stopping Service");
		if (this.opened) {
			await this.close();
			await this.synchronizer?.close();
		}
		await this.pool.stop();
		clearInterval(this._statsInterval);
		await this.synchronizer?.stop();
		this.running = false;
		this.config.logger?.info(`Stopped ${this.name} service.`);
		log("Service stopped");
		return true;
	}

	stats() {
		if (this.v8Engine !== null) {
			const { used_heap_size, heap_size_limit } =
				this.v8Engine.getHeapStatistics();

			const heapUsed = Math.round(used_heap_size / 1000 / 1000); // MB
			const percentage = Math.round((100 * used_heap_size) / heap_size_limit);
			const msg = `Memory stats usage=${heapUsed} MB percentage=${percentage}%`;

			if (this._statsCounter % 4 === 0) {
				this.config.logger?.info(msg);
				this._statsCounter = 0;
			} else {
				this.config.logger?.debug(msg);
			}

			if (
				percentage >= this.MEMORY_SHUTDOWN_THRESHOLD &&
				!this.config.shutdown
			) {
				this.config.logger?.error(
					"EMERGENCY SHUTDOWN DUE TO HIGH MEMORY LOAD...",
				);
				process.kill(process.pid, "SIGINT");
			}
			this._statsCounter += 1;
		}
	}

	/**
	 * Handles incoming request from connected peer
	 * @param message message object
	 * @param protocol protocol name
	 * @param peer peer
	 */
	async handle(_message: any, _protocol: string, _peer: Peer): Promise<any> {}
}
