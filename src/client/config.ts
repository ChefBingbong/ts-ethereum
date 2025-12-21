import type { Multiaddr } from "@multiformats/multiaddr";
import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { EventEmitter } from "eventemitter3";
import { Level } from "level";
import type { BlockHeader } from "../block";
import { Common } from "../chain-config";
import { genPrivateKey } from "../devp2p";
import type { PeerInfo as DPTPeerInfo } from "../devp2p/dpt-1/index.ts";
import { ETH } from "../devp2p/protocol/eth.ts";
import { dptDiscovery } from "../p2p/libp2p/discovery/index.ts";
import { P2PNode, type P2PNode as P2PNodeType } from "../p2p/libp2p/node.ts";
import type { ComponentLogger } from "../p2p/libp2p/types.ts";
import { rlpx } from "../p2p/transport/rlpx/index.ts";
import {
	type Address,
	BIGINT_0,
	BIGINT_1,
	BIGINT_2,
	BIGINT_256,
} from "../utils";
import { unprefixedHexToBytes } from "../utils/index.ts";
import type { VM, VMProfilerOpts } from "../vm";
import type { Logger } from "./logging.ts";
import type { EventParams, PrometheusMetrics } from "./types.ts";
import { Event } from "./types.ts";
import { isBrowser, short } from "./util";

const log = debug("p2p:config");

export type DataDirectory = (typeof DataDirectory)[keyof typeof DataDirectory];

export const DataDirectory = {
	Chain: "chain",
	State: "state",
	Meta: "meta",
} as const;

export type SyncMode = (typeof SyncMode)[keyof typeof SyncMode];

export const SyncMode = {
	Full: "full",
	None: "none",
} as const;

export interface ConfigOptions {
	/**
	 * Specify the chain by providing a {@link Common} instance,
	 * the common instance will not be modified by client
	 *
	 * Default: 'mainnet' Common
	 */
	common?: Common;

	/**
	 * Synchronization mode ('full', 'none')
	 *
	 * Default: 'full'
	 */
	syncmode?: SyncMode;

	/**
	 * A temporary option to offer backward compatibility with already-synced databases that are
	 * using non-prefixed keys for storage tries
	 *
	 * Default: true
	 */
	prefixStorageTrieKeys?: boolean;

	/**
	 * A temporary option to offer backward compatibility with already-synced databases that stores
	 * trie items as `string`, instead of the more performant `Uint8Array`
	 */
	useStringValueTrieDB?: boolean;

	/**
	 * Provide a custom VM instance to process blocks
	 *
	 * Default: VM instance created by client
	 */
	vm?: VM;

	/**
	 * Root data directory for the blockchain
	 */
	datadir?: string;

	/**
	 * Private key for the client.
	 * Use return value of {@link Config.getClientKey}.
	 * If left blank, a random key will be generated and used.
	 */
	key?: Uint8Array;

	/**
	 * Network bootnodes
	 * (e.g. abc@18.138.108.67 or /ip4/127.0.0.1/tcp/50505/p2p/QmABC)
	 */
	bootnodes?: Multiaddr[];

	/**
	 * RLPx listening port
	 *
	 * Default: `30303`
	 */
	port?: number;

	/**
	 * RLPx external IP
	 */
	extIP?: string;

	/**
	 * Network multiaddrs for libp2p
	 * (e.g. /ip4/127.0.0.1/tcp/50505/p2p/QmABC)
	 */
	multiaddrs?: Multiaddr[];

	/**
	 * Transport server (for testing purposes)
	 * @deprecated Use node instead
	 */

	/**
	 * Save tx receipts and logs in the meta db (default: false)
	 */
	saveReceipts?: boolean;

	/**
	 * Number of recent blocks to maintain transactions index for
	 * (default = 2350000 = about one year, 0 = entire chain)
	 */
	txLookupLimit?: number;

	/**
	 * A custom winston logger can be provided
	 * if setting logging verbosity is not sufficient
	 *
	 * Default: Logger with loglevel 'info'
	 */
	logger?: Logger;

	/**
	 * Max items per block or header request
	 *
	 * Default: `100`
	 */
	maxPerRequest?: number;

	/**
	 * Max jobs to be enqueued in the fetcher at any given time
	 *
	 * Default: `100`
	 */
	maxFetcherJobs?: number;

	/**
	 * Max outgoing multi-peer requests by the fetcher at any given time
	 */
	maxFetcherRequests?: number;

	/**
	 * Number of peers needed before syncing
	 *
	 * Default: `1`
	 */
	minPeers?: number;

	/**
	 * Maximum peers allowed
	 *
	 * Default: `25`
	 */
	maxPeers?: number;

	/**
	 * Start continuous VM execution (pre-Merge setting)
	 */
	execution?: boolean;

	/**
	 * Number of blocks to execute in batch mode and logged to console
	 */
	numBlocksPerIteration?: number;

	/**
	 * Size for the account cache (max number of accounts)
	 */
	accountCache?: number;

	/**
	 * Size for the storage cache (max number of contracts)
	 */
	storageCache?: number;

	/**
	 * Size for the code cache (max number of contracts)
	 */
	codeCache?: number;

	/**
	 * Size for the trie cache (max number of trie nodes)
	 */
	trieCache?: number;

	/**
	 * Generate code for local debugging, currently providing a
	 * code snippet which can be used to run blocks on the
	 * EthereumJS VM on execution errors
	 *
	 * (meant to be used internally for the most part)
	 */
	debugCode?: boolean;

	/**
	 * Use v4 ("findneighbour" node requests) for peer discovery
	 *
	 * Default: `false` for testnets, true for mainnet
	 */
	discV4?: boolean;

	/**
	 * Enable mining
	 *
	 * Default: `false`
	 */
	mine?: boolean;

	/**
	 * Is a single node and doesn't need peers for synchronization
	 *
	 * Default: `false`
	 */
	isSingleNode?: boolean;

	/**
	 * Whether to profile VM blocks
	 */
	vmProfileBlocks?: boolean;

	/**
	 * Whether to profile VM txs
	 */
	vmProfileTxs?: boolean;

	/**
	 * Unlocked accounts of form [address, privateKey]
	 * Currently only the first account is used to seal mined PoA blocks
	 *
	 * Default: []
	 */
	accounts?: [address: Address, privKey: Uint8Array][];

	/**
	 * Address for mining rewards (etherbase)
	 * If not provided, defaults to the primary account.
	 */
	minerCoinbase?: Address;

	/**
	 * If there is a reorg, this is a safe distance from which
	 * to try to refetch and re-feed the blocks.
	 */
	safeReorgDistance?: number;

	maxRangeBytes?: number;

	maxAccountRange?: bigint;
	/**
	 * The time after which synced state is downgraded to unsynced
	 */
	syncedStateRemovalPeriod?: number;

	/**
	 * Max depth for parent lookups in engine's newPayload and forkchoiceUpdated
	 */
	engineParentLookupMaxDepth?: number;

	/**
	 * Max blocks including unexecuted parents to be executed in engine's newPayload
	 */
	engineNewpayloadMaxExecute?: number;

	/**
	 * Limit max transactions per block to execute in engine's newPayload for responsive engine api
	 */
	engineNewpayloadMaxTxsExecute?: number;

	maxStorageRange?: bigint;

	/**
	 * Cache size of invalid block hashes and their errors
	 */
	maxInvalidBlocksErrorCache?: number;
	pruneEngineCache?: boolean;

	/**
	 * Save account keys preimages in the meta db (default: false)
	 */
	savePreimages?: boolean;

	/**
	 * The cache for blobs and proofs to support CL import blocks
	 */
	blobsAndProofsCacheBlocks?: number;

	/**
	 * Enables Prometheus Metrics that can be collected for monitoring client health
	 */
	prometheusMetrics?: PrometheusMetrics;

	/**
	 * Use the new P2P server implementation with Transport + Mplex + Multi-stream-select
	 * instead of the legacy RLPx server (default: false for backward compatibility)
	 */
	useP2PServer?: boolean;
}

export class Config {
	/**
	 * Central event bus for events emitted by the different
	 * components of the client
	 */
	public readonly events: EventEmitter<EventParams>;

	public static readonly SYNCMODE_DEFAULT = SyncMode.Full;
	public static readonly DATADIR_DEFAULT = `./datadir`;
	public static readonly PORT_DEFAULT = 30303;
	public static readonly MAXPERREQUEST_DEFAULT = 100;
	public static readonly MAXFETCHERJOBS_DEFAULT = 100;
	public static readonly MAXFETCHERREQUESTS_DEFAULT = 5;
	public static readonly MINPEERS_DEFAULT = 1;
	public static readonly MAXPEERS_DEFAULT = 25;
	public static readonly EXECUTION = true;
	public static readonly NUM_BLOCKS_PER_ITERATION = 100;
	public static readonly ACCOUNT_CACHE = 400000;
	public static readonly STORAGE_CACHE = 200000;
	public static readonly CODE_CACHE = 200000;
	public static readonly TRIE_CACHE = 200000;
	public static readonly DEBUGCODE_DEFAULT = false;
	public static readonly SAFE_REORG_DISTANCE = 100;

	public static readonly MAX_RANGE_BYTES = 50000;
	// This should get like 100 accounts in this range
	public static readonly MAX_ACCOUNT_RANGE =
		(BIGINT_2 ** BIGINT_256 - BIGINT_1) / BigInt(1_000);
	// Larger ranges used for storage slots since assumption is slots should be much sparser than accounts
	public static readonly MAX_STORAGE_RANGE =
		(BIGINT_2 ** BIGINT_256 - BIGINT_1) / BigInt(10);

	public static readonly MAX_INVALID_BLOCKS_ERROR_CACHE = 128;
	public static readonly PRUNE_ENGINE_CACHE = true;

	public static readonly SYNCED_STATE_REMOVAL_PERIOD = 60000;
	// engine new payload calls can come in batch of 64, keeping 128 as the lookup factor
	public static readonly ENGINE_PARENT_LOOKUP_MAX_DEPTH = 128;
	public static readonly ENGINE_NEWPAYLOAD_MAX_EXECUTE = 2;
	public static readonly ENGINE_NEWPAYLOAD_MAX_TXS_EXECUTE = 200;

	// support blobs and proofs cache for CL getBlobs for upto 1 epoch of data
	public static readonly BLOBS_AND_PROOFS_CACHE_BLOCKS = 32;

	public readonly logger: Logger | undefined;
	public readonly syncmode: SyncMode;
	public readonly vm?: VM;
	public readonly datadir: string;
	public readonly key: Uint8Array;
	public readonly bootnodes?: Multiaddr[];
	public readonly port?: number;
	public readonly extIP?: string;
	public readonly multiaddrs?: Multiaddr[];
	public readonly saveReceipts: boolean;
	public readonly txLookupLimit: number;
	public readonly maxPerRequest: number;
	public readonly maxFetcherJobs: number;
	public readonly maxFetcherRequests: number;
	public readonly minPeers: number;
	public readonly maxPeers: number;
	public readonly execution: boolean;
	public readonly numBlocksPerIteration: number;
	public readonly accountCache: number;
	public readonly storageCache: number;
	public readonly codeCache: number;
	public readonly trieCache: number;
	public readonly debugCode: boolean;
	public readonly discV4: boolean;
	public readonly mine: boolean;
	public readonly isSingleNode: boolean;
	public readonly accounts: [address: Address, privKey: Uint8Array][];
	public readonly minerCoinbase?: Address;
	public readonly vmProfilerOpts?: VMProfilerOpts;

	public readonly safeReorgDistance: number;
	public readonly maxRangeBytes: number;
	public readonly maxAccountRange: bigint;
	public readonly maxStorageRange: bigint;
	public readonly maxInvalidBlocksErrorCache: number;
	public readonly pruneEngineCache: boolean;
	public node: P2PNodeType | undefined;
	public readonly syncedStateRemovalPeriod: number;
	public readonly engineParentLookupMaxDepth: number;
	public readonly engineNewpayloadMaxExecute: number;
	public readonly engineNewpayloadMaxTxsExecute: number;

	public readonly prefixStorageTrieKeys: boolean;
	public readonly useStringValueTrieDB: boolean;
	public readonly savePreimages: boolean;

	public readonly blobsAndProofsCacheBlocks: number;

	public synchronized: boolean;
	public lastSynchronized?: boolean;
	/** lastSyncDate in ms */
	public lastSyncDate: number;
	/** Best known block height */
	public syncTargetHeight?: bigint;
	/** Client is in the process of shutting down */
	public shutdown: boolean = false;

	public readonly chainCommon: Common;
	public readonly execCommon: Common;

	public readonly metrics: PrometheusMetrics | undefined;

	constructor(options: ConfigOptions = {}) {
		this.events = new EventEmitter<EventParams>();

		this.syncmode = options.syncmode ?? Config.SYNCMODE_DEFAULT;
		this.vm = options.vm;
		this.bootnodes = options.bootnodes;
		this.port = options.port ?? Config.PORT_DEFAULT;
		this.extIP = options.extIP;
		this.multiaddrs = options.multiaddrs;
		this.datadir = options.datadir ?? Config.DATADIR_DEFAULT;
		this.key = options.key ?? genPrivateKey();
		this.saveReceipts = options.saveReceipts ?? false;
		this.txLookupLimit = options.txLookupLimit ?? 2350000;
		this.maxPerRequest = options.maxPerRequest ?? Config.MAXPERREQUEST_DEFAULT;
		this.maxFetcherJobs =
			options.maxFetcherJobs ?? Config.MAXFETCHERJOBS_DEFAULT;
		this.maxFetcherRequests =
			options.maxFetcherRequests ?? Config.MAXFETCHERREQUESTS_DEFAULT;
		this.minPeers = options.minPeers ?? Config.MINPEERS_DEFAULT;
		this.maxPeers = options.maxPeers ?? Config.MAXPEERS_DEFAULT;
		this.execution = options.execution ?? Config.EXECUTION;
		this.numBlocksPerIteration =
			options.numBlocksPerIteration ?? Config.NUM_BLOCKS_PER_ITERATION;
		this.accountCache = options.accountCache ?? Config.ACCOUNT_CACHE;
		this.storageCache = options.storageCache ?? Config.STORAGE_CACHE;
		this.codeCache = options.codeCache ?? Config.CODE_CACHE;
		this.trieCache = options.trieCache ?? Config.TRIE_CACHE;
		this.debugCode = options.debugCode ?? Config.DEBUGCODE_DEFAULT;
		this.mine = options.mine ?? false;
		this.isSingleNode = options.isSingleNode ?? false;
		this.savePreimages = options.savePreimages ?? false;

		if (
			options.vmProfileBlocks !== undefined ||
			options.vmProfileTxs !== undefined
		) {
			this.vmProfilerOpts = {
				reportAfterBlock: options.vmProfileBlocks !== false,
				reportAfterTx: options.vmProfileTxs !== false,
			};
		}

		this.accounts = options.accounts ?? [];
		this.minerCoinbase = options.minerCoinbase;

		this.safeReorgDistance =
			options.safeReorgDistance ?? Config.SAFE_REORG_DISTANCE;

		this.maxRangeBytes = options.maxRangeBytes ?? Config.MAX_RANGE_BYTES;
		this.maxAccountRange = options.maxAccountRange ?? Config.MAX_ACCOUNT_RANGE;
		this.maxStorageRange = options.maxStorageRange ?? Config.MAX_STORAGE_RANGE;

		this.maxInvalidBlocksErrorCache =
			options.maxInvalidBlocksErrorCache ??
			Config.MAX_INVALID_BLOCKS_ERROR_CACHE;
		this.pruneEngineCache =
			options.pruneEngineCache ?? Config.PRUNE_ENGINE_CACHE;

		this.syncedStateRemovalPeriod =
			options.syncedStateRemovalPeriod ?? Config.SYNCED_STATE_REMOVAL_PERIOD;
		this.engineParentLookupMaxDepth =
			options.engineParentLookupMaxDepth ??
			Config.ENGINE_PARENT_LOOKUP_MAX_DEPTH;
		this.engineNewpayloadMaxExecute =
			options.engineNewpayloadMaxExecute ??
			Config.ENGINE_NEWPAYLOAD_MAX_EXECUTE;
		this.engineNewpayloadMaxTxsExecute =
			options.engineNewpayloadMaxTxsExecute ??
			Config.ENGINE_NEWPAYLOAD_MAX_TXS_EXECUTE;

		this.prefixStorageTrieKeys = options.prefixStorageTrieKeys ?? true;
		this.useStringValueTrieDB = options.useStringValueTrieDB ?? false;

		this.metrics = options.prometheusMetrics;

		// Start it off as synchronized if this is configured to mine or as single node
		this.synchronized = this.isSingleNode ?? this.mine;
		this.lastSyncDate = 0;

		const common = options.common;
		this.chainCommon = common.copy();
		this.execCommon = common.copy();

		this.blobsAndProofsCacheBlocks =
			options.blobsAndProofsCacheBlocks ?? Config.BLOBS_AND_PROOFS_CACHE_BLOCKS;

		this.discV4 = options.discV4 ?? true;

		this.logger = options.logger;

		this.logger?.info(`Sync Mode ${this.syncmode}`);
		if (this.syncmode !== SyncMode.None) {
			if (isBrowser() !== true) {
				// Create P2PNode instead of RlpxServer
				this.node = this.createP2PNode(options);
			}
		}

		this.events.once(Event.CLIENT_SHUTDOWN, () => {
			this.shutdown = true;
		});
	}

	/**
	 * Update the synchronized state of the chain
	 * @param option latest to update the sync state with
	 * @emits {@link Event.SYNC_SYNCHRONIZED}
	 */
	updateSynchronizedState(
		latest?: BlockHeader | null,
		emitSyncEvent?: boolean,
	) {
		// If no syncTargetHeight has been discovered from peer and neither the client is set
		// for mining/single run (validator), then sync state can't be updated
		if (
			(this.syncTargetHeight ?? BIGINT_0) === BIGINT_0 &&
			!this.mine &&
			!this.isSingleNode
		) {
			return;
		}

		if (latest !== null && latest !== undefined) {
			const height = latest.number;
			if (height >= (this.syncTargetHeight ?? BIGINT_0)) {
				this.syncTargetHeight = height;
				this.lastSyncDate =
					typeof latest.timestamp === "bigint" && latest.timestamp > BIGINT_0
						? Number(latest.timestamp) * 1000
						: Date.now();

				const diff = Date.now() - this.lastSyncDate;
				// update synchronized
				if (diff < this.syncedStateRemovalPeriod) {
					if (!this.synchronized) {
						this.synchronized = true;
						// Log to console the sync status
						this.superMsg(
							`Synchronized blockchain at height=${height} hash=${short(latest.hash())} 🎉`,
						);
					}

					if (emitSyncEvent === true) {
						this.events.emit(Event.SYNC_SYNCHRONIZED, height);
					}
				}
			}
		} else {
			if (this.synchronized && !this.mine && !this.isSingleNode) {
				const diff = Date.now() - this.lastSyncDate;
				if (diff >= this.syncedStateRemovalPeriod) {
					this.synchronized = false;
					this.logger?.info(
						`Sync status reset (no chain updates for ${Math.round(diff / 1000)} seconds).`,
					);
				}
			}
		}

		if (this.synchronized !== this.lastSynchronized) {
			this.logger?.debug(
				`Client synchronized=${this.synchronized}${
					latest !== null && latest !== undefined
						? " height=" + latest.number
						: ""
				} syncTargetHeight=${this.syncTargetHeight} lastSyncDate=${
					(Date.now() - this.lastSyncDate) / 1000
				} secs ago`,
			);
			this.lastSynchronized = this.synchronized;
		}
	}

	/**
	 * Returns the network directory for the chain.
	 */
	getNetworkDirectory(): string {
		const networkDirName = this.chainCommon.chainName();
		return `${this.datadir}/${networkDirName}`;
	}

	getInvalidPayloadsDir(): string {
		return `${this.getNetworkDirectory()}/invalidPayloads`;
	}

	/**
	 * Returns the location for each {@link DataDirectory}
	 */
	getDataDirectory(dir: DataDirectory): string {
		const networkDir = this.getNetworkDirectory();
		switch (dir) {
			case DataDirectory.Chain: {
				const chainDataDirName = "chain";
				return `${networkDir}/${chainDataDirName}`;
			}
			case DataDirectory.State:
				return `${networkDir}/state`;
			case DataDirectory.Meta:
				return `${networkDir}/meta`;
		}
	}

	/**
	 * Returns the config level db.
	 */
	static getConfigDB(networkDir: string) {
		return new Level<string | Uint8Array, Uint8Array>(`${networkDir}/config`);
	}

	/**
	 * Gets the client private key from the config db.
	 */
	static async getClientKey(datadir: string, common: Common) {
		const networkDir = `${datadir}/${common.chainName()}`;
		const db = this.getConfigDB(networkDir);
		const encodingOpts = { keyEncoding: "utf8", valueEncoding: "view" };
		const dbKey = "config:client_key";
		let key;
		try {
			key = await db.get(dbKey, encodingOpts);
		} catch (error: any) {
			if (error.code === "LEVEL_NOT_FOUND") {
				// generate and save a new key
				key = genPrivateKey();
				await db.put(dbKey, key, encodingOpts);
			}
		}
		return key;
	}

	superMsg(msgs: string | string[], meta?: any) {
		if (typeof msgs === "string") {
			msgs = [msgs];
		}
		let len = 0;
		for (const msg of msgs) {
			len = msg.length > len ? msg.length : len;
		}
		this.logger?.info("-".repeat(len), meta);
		for (const msg of msgs) {
			this.logger?.info(msg, meta);
		}
		this.logger?.info("-".repeat(len), meta);
	}

	/**
	 * Returns specified option or the default setting for whether v4 peer discovery
	 * is enabled based on chainName.
	 */
	/**
	 * Register ETH protocol handler with P2PNode
	 */
	private registerEthProtocol(node: P2PNodeType): void {
		log("Registering ETH protocol handler with P2PNode");
		// Register ETH protocol handler with P2PNode for discovery/routing
		// Note: This is for protocol discovery only - messages go through RLPxConnection socket
		node.handle("/eth/68/1.0.0", () => {
			// Dummy handler - actual message handling is done through RLPxConnection
			// This registration allows P2PNode to advertise ETH protocol support
		});
	}

	/**
	 * Create P2PNode instance
	 * Note: P2PNode constructor is synchronous
	 */
	private createP2PNode(_options: ConfigOptions): P2PNodeType {
		log("Creating P2PNode with port %d, maxPeers %d", this.port, this.maxPeers);
		// Create ETH capabilities
		const capabilities = [ETH.eth68];

		// Convert bootnodes from Multiaddr to DPT PeerInfo format
		const dptBootnodes = this.convertBootnodesToDPT(
			this.bootnodes ?? (this.chainCommon.bootstrapNodes() as any),
		);
		log("Converted %d bootnodes to DPT format", dptBootnodes.length);

		// Create component logger from config logger
		const componentLogger = this.createComponentLogger();

		// Create P2PNode synchronously
		log("Instantiating P2PNode");
		const node = new P2PNode({
			privateKey: this.key,
			addresses: {
				listen: [
					this.extIP
						? `/ip4/${this.extIP}/tcp/${this.port}`
						: `/ip4/0.0.0.0/tcp/${this.port}`,
				],
			},
			transports: [
				(components) =>
					rlpx({
						privateKey: this.key,
						capabilities,
						common: this.chainCommon,
						timeout: 10000,
						maxConnections: this.maxPeers,
					})({
						logger: components.logger,
					}) as any, // Type assertion needed for transport compatibility
			],
			peerDiscovery: this.discV4
				? [
						(components) =>
							dptDiscovery({
								privateKey: this.key,
								bindAddr: this.extIP ?? "127.0.0.1",
								bindPort: this.port,
								bootstrapNodes: dptBootnodes,
								autoDial: true,
								autoDialBootstrap: true,
							})(components),
					]
				: [],
			maxConnections: this.maxPeers,
			logger: componentLogger as any, // Type assertion for logger compatibility
		});

		// Register ETH protocol handler
		this.registerEthProtocol(node);

		log("P2PNode created successfully");
		return node;
	}

	/**
	 * Convert Multiaddr bootnodes to DPT PeerInfo format
	 */
	private convertBootnodesToDPT(
		bootnodes: Multiaddr[] | string[] | string,
	): DPTPeerInfo[] {
		const result: DPTPeerInfo[] = [];

		// Normalize to array
		const bootnodeArray: Multiaddr[] = [];
		if (typeof bootnodes === "string") {
			bootnodeArray.push(multiaddr(bootnodes));
		} else if (Array.isArray(bootnodes)) {
			for (const bn of bootnodes) {
				if (typeof bn === "string") {
					bootnodeArray.push(multiaddr(bn));
				} else {
					bootnodeArray.push(bn);
				}
			}
		}

		// Convert each bootnode
		for (const ma of bootnodeArray) {
			try {
				const peerInfo = this.multiaddrToDPTPeerInfo(ma);
				if (peerInfo) {
					result.push(peerInfo);
				}
			} catch (err) {
				this.logger?.warn(
					`Failed to convert bootnode ${ma.toString()}: ${err}`,
				);
			}
		}

		return result;
	}

	/**
	 * Convert a Multiaddr to DPT PeerInfo format
	 */
	private multiaddrToDPTPeerInfo(ma: Multiaddr): DPTPeerInfo | null {
		// Extract node ID from multiaddr
		// Format: /ip4/127.0.0.1/tcp/30303/p2p/<peer-id>
		// Or: /ip4/127.0.0.1/tcp/30303 (no peer ID)
		// Or: enode://<node-id>@<ip>:<port>

		const maString = ma.toString();
		let address: string | undefined;
		let tcpPort: number | undefined;
		let udpPort: number | undefined;
		let nodeId: Uint8Array | undefined;

		// Check for enode format first: enode://<node-id>@<ip>:<port>
		const enodeMatch = maString.match(/enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)/);
		if (enodeMatch) {
			const [, nodeIdHex, ip, port] = enodeMatch;
			try {
				nodeId = unprefixedHexToBytes(nodeIdHex);
				address = ip;
				tcpPort = parseInt(port, 10);
				udpPort = parseInt(port, 10);
			} catch {
				// Ignore conversion errors
			}
		} else {
			// Parse multiaddr format: /ip4/127.0.0.1/tcp/30303[/p2p/...]
			const parts = maString.split("/");
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const nextPart = parts[i + 1];

				if (part === "ip4" && nextPart) {
					address = nextPart;
				} else if (part === "ip6" && nextPart) {
					address = nextPart;
				} else if (part === "tcp" && nextPart) {
					tcpPort = parseInt(nextPart, 10);
				} else if (part === "udp" && nextPart) {
					udpPort = parseInt(nextPart, 10);
				} else if (part === "p2p" && nextPart) {
					// Try to extract node ID from p2p protocol
					try {
						// P2P protocol uses base58 or hex encoding
						// For DPT, we need 64-byte node ID (secp256k1 public key)
						// This is a simplified conversion - may need adjustment
						const peerIdBytes = Buffer.from(nextPart, "hex");
						if (peerIdBytes.length === 64) {
							nodeId = new Uint8Array(peerIdBytes);
						}
					} catch {
						// Ignore conversion errors
					}
				}
			}
		}

		if (!address || !tcpPort) {
			return null;
		}

		return {
			id: nodeId || new Uint8Array(64), // DPT will generate if missing
			address,
			tcpPort,
			udpPort: udpPort || tcpPort,
		};
	}

	/**
	 * Create ComponentLogger from Config logger
	 */
	private createComponentLogger(): ComponentLogger {
		// Create a simple component logger adapter
		// The P2PNode expects ComponentLogger, but Config has Logger
		return {
			forComponent: (component: string) => {
				// Return a logger that wraps the config logger
				const logFn = (formatter: string, ...args: any[]) => {
					this.logger?.info(`[${component}] ${formatter}`, ...args);
				};
				logFn.enabled = true;
				logFn.trace = (formatter: string, ...args: any[]) => {
					this.logger?.debug(`[${component}] ${formatter}`, ...args);
				};
				logFn.error = (formatter: string, ...args: any[]) => {
					this.logger?.error(`[${component}] ${formatter}`, ...args);
				};
				logFn.newScope = (name: string) =>
					this.createComponentLogger().forComponent(`${component}:${name}`);
				return logFn as any;
			},
		};
	}

	getDiscV4(option: boolean | undefined): boolean {
		if (option !== undefined) return option;
		return true;
	}
}
