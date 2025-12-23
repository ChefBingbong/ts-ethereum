import debug from "debug";
import { EventEmitter } from "eventemitter3";
import type { BlockBodyBytes, BlockHeader } from "../../../block";
import type { Chain } from "../../../client/blockchain";
import type { Config } from "../../../client/config";
import type { VMExecution } from "../../../client/execution";
import type { Peer } from "../../../client/net/peer/peer.ts";
import {
	ETH_MESSAGES,
	EthMessageCode,
} from "../../../client/net/protocol/eth/definitions";
import { ETH } from "../../../client/net/protocol/eth/eth";
import type { EthProtocolMethods } from "../../../client/net/protocol/eth/eth-methods";
import type { EthHandlerContext } from "../../../client/net/protocol/eth/handlers.ts";
import type { TypedTransaction } from "../../../tx";
import { BIGINT_0, bigIntToUnpaddedBytes, bytesToBigInt } from "../../../utils";
import type { TxReceipt } from "../../../vm";
import type { RLPxConnection } from "../../transport/rlpx/connection";
import { registerDefaultHandlers } from "./handlers";
import { EthHandlerRegistry } from "./registry";
import { validateStatus } from "./status";
import type { EthStatus, RequestResolver } from "./types";
import type { EthStatusOpts } from "./wire";

const log = debug("p2p:eth:handler");

/**
 * ETH Protocol Handler
 *
 * Handles ETH protocol messages through RLPxConnection socket.
 * Messages are sent/received via ECIES-encrypted RLPx connection,
 * not through libp2p streams.
 *
 * Implements EthProtocolMethods interface for compatibility with existing code.
 */
export class EthHandler extends EventEmitter implements EthProtocolMethods {
	public readonly name = "eth";
	public readonly config: Config;
	public readonly chain: Chain;
	public readonly execution: VMExecution;
	private readonly rlpxConnection: RLPxConnection;

	// Execution context for handlers that need txPool, synchronizer, etc.
	public context?: EthHandlerContext;

	// Protocol state
	private _status: EthStatus | null = null;
	private _peerStatus: EthStatus | null = null;
	private _statusExchanged: boolean = false;
	public updatedBestHeader?: BlockHeader;

	// Request tracking for async request/response matching
	public readonly resolvers: Map<bigint, RequestResolver> = new Map();
	private readonly timeout: number = 8000; // 8 second timeout
	private nextReqId = BIGINT_0;

	// Request deduplication: track in-flight requests to avoid duplicates
	private inFlightRequests: Map<string, Promise<any>> = new Map();

	// ETH protocol instance from RLPxConnection
	// NOTE: devp2p ETH protocol is now only used for:
	// - Event listening (message, status events from RLPxConnection)
	// - Getting protocol version and offset
	// All message encoding/sending is done via wire module and RLPxConnection directly
	private ethProtocol: ETH | null = null;
	private protocolOffset: number = 0;
	private protocolVersion: number = 68; // Default to ETH/68

	// Handler registry for request/response routing
	public readonly registry: EthHandlerRegistry = new EthHandlerRegistry();

	constructor(options: {
		config: Config;
		chain: Chain;
		execution: VMExecution;
		rlpxConnection: RLPxConnection;
		context?: EthHandlerContext;
	}) {
		super();
		this.config = options.config;
		this.chain = options.chain;
		this.execution = options.execution;
		this.rlpxConnection = options.rlpxConnection;
		this.context = options.context;

		// Find ETH protocol from RLPxConnection first
		this.setupProtocol();

		// Register all default handlers with protocol's registry
		registerDefaultHandlers(this.registry);
	}

	/**
	 * Find peer associated with this handler's RLPxConnection
	 * Used by handlers that need to pass peer to execution context handlers
	 */
	public findPeer(): Peer | undefined {
		if (!this.context?.networkCore) return undefined;

		const peers = this.context.networkCore.getConnectedPeers();
		return peers.find((peer) => {
			if ("rlpxConnection" in peer) {
				return (peer as any).rlpxConnection === this.rlpxConnection;
			}
			return false;
		});
	}

	/**
	 * Setup ETH protocol from RLPxConnection
	 */
	private setupProtocol(): void {
		const protocols = this.rlpxConnection.getProtocols();
		const ethProtocol = protocols.find((p) => p.constructor.name === "ETH") as
			| ETH
			| undefined;

		if (!ethProtocol) {
			log("No ETH protocol found in RLPxConnection");
			return;
		}

		this.ethProtocol = ethProtocol;

		// Get protocol version
		if ((ethProtocol as any)._version !== undefined) {
			this.protocolVersion = (ethProtocol as any)._version;
		}

		// Find protocol offset
		const protocolsDesc = (this.rlpxConnection as any)._protocols as Array<{
			protocol: ETH;
			offset: number;
			length: number;
		}>;
		const ethDesc = protocolsDesc.find(
			(p) => p.protocol.constructor.name === "ETH",
		);
		if (ethDesc) {
			this.protocolOffset = ethDesc.offset;
		}

		// Listen to protocol events from devp2p ETH protocol
		// The devp2p protocol handles RLP decoding and emits decoded payloads
		// We only use it for event listening - all sending is done via wire module
		ethProtocol.events.on("message", (code: number, payload: any) => {
			this.handleMessage(code, payload);
		});

		ethProtocol.events.on("status", (status: any) => {
			this.handleStatus(status);
		});

		// Check if STATUS was already received (protocol might have received it before we set up listener)
		// The ETH protocol emits "status" event when both _status and _peerStatus are set
		// If _peerStatus is already set, STATUS was received but event might have fired already
		const peerStatus = (ethProtocol as any)._peerStatus;
		const localStatus = (ethProtocol as any)._status;
		if (peerStatus && localStatus) {
			// Both STATUS messages received, construct the status object and handle it
			try {
				const statusObj = {
					chainId: peerStatus[1] as Uint8Array,
					td: peerStatus[2] as Uint8Array,
					bestHash: peerStatus[3] as Uint8Array,
					genesisHash: peerStatus[4] as Uint8Array,
					forkId: peerStatus.length > 5 ? peerStatus[5] : undefined,
				};
				this.handleStatus(statusObj);
			} catch (err: any) {
				log("Error handling existing STATUS: %s", err.message);
			}
		}

		// Note: STATUS is sent by P2PPeerPool after protocols:ready
		// We just listen for incoming STATUS messages
	}

	/**
	 * Send STATUS message (called by P2PPeerPool or external code)
	 * Delegates to protocol's sendStatus method
	 */
	sendStatus(): void {
		if (this._status !== null) {
			log("STATUS already sent");
			return;
		}

		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		try {
			const header = this.chain.headers.latest;
			if (!header) {
				throw new Error("No chain header available for STATUS");
			}

			const genesis = this.chain.genesis;
			if (!genesis) {
				throw new Error("No genesis block available for STATUS");
			}

			const statusOpts: EthStatusOpts = {
				td: bigIntToUnpaddedBytes(this.chain.headers.td),
				bestHash: header.hash(),
				genesisHash: genesis.hash(),
				latestBlock: bigIntToUnpaddedBytes(header.number),
			};

			// Use protocol's sendStatus which handles encoding and sending
			this.ethProtocol.sendStatus(statusOpts);

			this._status = {
				chainId: this.config.chainCommon.chainId(),
				td: this.chain.headers.td,
				bestHash: header.hash(),
				genesisHash: genesis.hash(),
				forkId: undefined,
			};

			log("Sent STATUS message");
		} catch (error: any) {
			log("Error sending STATUS: %s", error.message);
			this.emit("error", error);
		}
	}

	/**
	 * Handle incoming STATUS message
	 */
	private handleStatus(status: any): void {
		try {
			// Decode peer status
			const peerStatus: EthStatus = {
				chainId: bytesToBigInt(status.chainId),
				td: bytesToBigInt(status.td),
				bestHash: status.bestHash,
				genesisHash: status.genesisHash,
				forkId: status.forkId,
			};

			// Get local status
			const localStatus: EthStatus = {
				chainId: this.config.chainCommon.chainId(),
				td: this.chain.headers.td,
				bestHash: this.chain.headers.latest?.hash() ?? new Uint8Array(32),
				genesisHash: this.chain.genesis?.hash() ?? new Uint8Array(32),
				forkId: undefined,
			};

			// Validate status
			validateStatus(localStatus, peerStatus);

			this._peerStatus = peerStatus;
			this._statusExchanged = true;

			log("STATUS exchange completed successfully");
			this.emit("status", peerStatus);
		} catch (error: any) {
			log("Error handling STATUS: %s", error.message);
			// Note: Peer reference not available yet, emit without peer
			this.emit("error", error);
			this.rlpxConnection.disconnect();
		}
	}

	/**
	 * Handle incoming protocol message using registry
	 * Delegates to protocol's message handling
	 */
	private handleMessage(code: number, payload: any): void {
		if (!this._statusExchanged && code !== EthMessageCode.STATUS) {
			log("Received message before STATUS exchange: code=%d", code);
			return;
		}

		// STATUS is handled separately by protocol
		if (code === EthMessageCode.STATUS) {
			return; // Already handled by handleStatus()
		}

		// Route to handler via registry
		const handler = this.registry.getHandler(code as EthMessageCode);
		if (handler) {
			try {
				const result = handler(this, payload);
				if (result instanceof Promise) {
					result.catch((err) => {
						log("Error handling message code 0x%02x: %s", code, err.message);
						this.emit("error", err);
					});
				}
			} catch (error: any) {
				log("Error handling message code 0x%02x: %s", code, error.message);
				this.emit("error", error);
			}
		} else {
			log("No handler registered for message code: 0x%02x", code);
		}
	}

	/**
	 * Send a protocol message
	 * Delegates to protocol's sendMessage which handles encoding and sending
	 */
	sendMessage(code: number, payload: any): void {
		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		// Use protocol's sendMessage which handles encoding, compression, and sending
		this.ethProtocol.sendMessage(code as EthMessageCode, payload);
	}

	/**
	 * Get protocol version
	 */
	getProtocolVersion(): number {
		return this.protocolVersion;
	}

	/**
	 * Get protocol offset
	 */
	getProtocolOffset(): number {
		return this.protocolOffset;
	}

	/**
	 * Request block headers from peer
	 */
	async getBlockHeaders(opts: {
		reqId?: bigint;
		block: bigint | Uint8Array;
		max: number;
		skip?: number;
		reverse?: boolean;
	}): Promise<[bigint, BlockHeader[]]> {
		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		if (!this._statusExchanged) {
			throw new Error("STATUS exchange not completed");
		}

		// Request deduplication: check if same request is already in flight
		const blockKey =
			typeof opts.block === "bigint"
				? opts.block.toString()
				: Array.from(opts.block.slice(0, 8))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join("");
		const requestKey = `headers-${blockKey}-${opts.max}-${opts.skip || 0}-${opts.reverse || false}`;

		if (this.inFlightRequests.has(requestKey)) {
			log("Deduplicating GET_BLOCK_HEADERS request: %s", requestKey);
			return this.inFlightRequests.get(requestKey)!;
		}

		// Generate request ID if not provided
		const reqId = opts.reqId ?? ++this.nextReqId;

		// Encode request using protocol definitions
		const requestData = ETH_MESSAGES[EthMessageCode.GET_BLOCK_HEADERS].encode(
			{ ...opts, reqId },
			{ value: this.nextReqId },
		);

		// Send request using wire module
		this.sendMessage(EthMessageCode.GET_BLOCK_HEADERS, requestData);

		log("Sent GET_BLOCK_HEADERS request: reqId=%d", reqId);

		// Wait for response
		const promise = new Promise<[bigint, BlockHeader[]]>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.resolvers.has(reqId)) {
					this.resolvers.delete(reqId);
					this.inFlightRequests.delete(requestKey);
					reject(
						new Error(`GET_BLOCK_HEADERS request timed out (reqId=${reqId})`),
					);
				}
			}, this.timeout);

			this.resolvers.set(reqId, {
				resolve: (value: unknown) => {
					clearTimeout(timeout);
					this.inFlightRequests.delete(requestKey);
					const result = value as [bigint, BlockHeader[]];
					resolve(result);
				},
				reject: (err) => {
					clearTimeout(timeout);
					this.inFlightRequests.delete(requestKey);
					reject(err);
				},
				timeout,
			});
		});

		this.inFlightRequests.set(requestKey, promise);
		return promise;
	}

	/**
	 * Request block bodies from peer
	 */
	async getBlockBodies(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, BlockBodyBytes[]]> {
		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		if (!this._statusExchanged) {
			throw new Error("STATUS exchange not completed");
		}

		// Request deduplication: check if same request is already in flight
		const hashesKey = opts.hashes
			.map((h) =>
				Array.from(h.slice(0, 4))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join(""),
			)
			.join("-");
		const requestKey = `bodies-${hashesKey}`;

		if (this.inFlightRequests.has(requestKey)) {
			log(
				"Deduplicating GET_BLOCK_BODIES request: %d hashes",
				opts.hashes.length,
			);
			return this.inFlightRequests.get(requestKey)!;
		}

		// Generate request ID if not provided
		const reqId = opts.reqId ?? ++this.nextReqId;

		// Encode request using protocol definitions
		const requestData = ETH_MESSAGES[EthMessageCode.GET_BLOCK_BODIES].encode(
			{ ...opts, reqId },
			{ value: this.nextReqId },
		);

		// Send request using wire module
		this.sendMessage(EthMessageCode.GET_BLOCK_BODIES, requestData);

		log(
			"Sent GET_BLOCK_BODIES request: reqId=%d, hashes=%d",
			reqId,
			opts.hashes.length,
		);

		// Wait for response
		const promise = new Promise<[bigint, BlockBodyBytes[]]>(
			(resolve, reject) => {
				const timeout = setTimeout(() => {
					if (this.resolvers.has(reqId)) {
						this.resolvers.delete(reqId);
						this.inFlightRequests.delete(requestKey);
						reject(
							new Error(`GET_BLOCK_BODIES request timed out (reqId=${reqId})`),
						);
					}
				}, this.timeout);

				this.resolvers.set(reqId, {
					resolve: (value: unknown) => {
						clearTimeout(timeout);
						this.inFlightRequests.delete(requestKey);
						const result = value as [bigint, BlockBodyBytes[]];
						resolve(result);
					},
					reject: (err) => {
						clearTimeout(timeout);
						this.inFlightRequests.delete(requestKey);
						reject(err);
					},
					timeout,
				});
			},
		);

		this.inFlightRequests.set(requestKey, promise);
		return promise;
	}

	/**
	 * Request pooled transactions from peer
	 */
	async getPooledTransactions(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, TypedTransaction[]]> {
		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		if (!this._statusExchanged) {
			throw new Error("STATUS exchange not completed");
		}

		// Request deduplication: check if same request is already in flight
		const hashesKey = opts.hashes
			.map((h) =>
				Array.from(h.slice(0, 4))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join(""),
			)
			.join("-");
		const requestKey = `pooled-txs-${hashesKey}`;

		if (this.inFlightRequests.has(requestKey)) {
			log(
				"Deduplicating GET_POOLED_TRANSACTIONS request: %d hashes",
				opts.hashes.length,
			);
			return this.inFlightRequests.get(requestKey)!;
		}

		// Generate request ID if not provided
		const reqId = opts.reqId ?? ++this.nextReqId;

		// Encode request using protocol definitions
		const requestData = ETH_MESSAGES[
			EthMessageCode.GET_POOLED_TRANSACTIONS
		].encode({ ...opts, reqId }, { value: this.nextReqId });

		// Send request using wire module
		this.sendMessage(EthMessageCode.GET_POOLED_TRANSACTIONS, requestData);

		log(
			"Sent GET_POOLED_TRANSACTIONS request: reqId=%d, hashes=%d",
			reqId,
			opts.hashes.length,
		);

		// Wait for response
		const promise = new Promise<[bigint, TypedTransaction[]]>(
			(resolve, reject) => {
				const timeout = setTimeout(() => {
					if (this.resolvers.has(reqId)) {
						this.resolvers.delete(reqId);
						this.inFlightRequests.delete(requestKey);
						reject(
							new Error(
								`GET_POOLED_TRANSACTIONS request timed out (reqId=${reqId})`,
							),
						);
					}
				}, this.timeout);

				this.resolvers.set(reqId, {
					resolve: (value: unknown) => {
						clearTimeout(timeout);
						this.inFlightRequests.delete(requestKey);
						const result = value as [bigint, TypedTransaction[]];
						resolve(result);
					},
					reject: (err) => {
						clearTimeout(timeout);
						this.inFlightRequests.delete(requestKey);
						reject(err);
					},
					timeout,
				});
			},
		);

		this.inFlightRequests.set(requestKey, promise);
		return promise;
	}

	/**
	 * Request receipts from peer
	 */
	async getReceipts(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, TxReceipt[]]> {
		if (!this.ethProtocol) {
			throw new Error("ETH protocol not available");
		}

		if (!this._statusExchanged) {
			throw new Error("STATUS exchange not completed");
		}

		// Request deduplication: check if same request is already in flight
		const hashesKey = opts.hashes
			.map((h) =>
				Array.from(h.slice(0, 4))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join(""),
			)
			.join("-");
		const requestKey = `receipts-${hashesKey}`;

		if (this.inFlightRequests.has(requestKey)) {
			log("Deduplicating GET_RECEIPTS request: %d hashes", opts.hashes.length);
			return this.inFlightRequests.get(requestKey)!;
		}

		// Generate request ID if not provided
		const reqId = opts.reqId ?? ++this.nextReqId;

		// Encode request using protocol definitions
		const requestData = ETH_MESSAGES[EthMessageCode.GET_RECEIPTS].encode(
			{ ...opts, reqId },
			{ value: this.nextReqId },
		);

		// Send request using wire module
		this.sendMessage(EthMessageCode.GET_RECEIPTS, requestData);

		log(
			"Sent GET_RECEIPTS request: reqId=%d, hashes=%d",
			reqId,
			opts.hashes.length,
		);

		// Wait for response
		const promise = new Promise<[bigint, TxReceipt[]]>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.resolvers.has(reqId)) {
					this.resolvers.delete(reqId);
					this.inFlightRequests.delete(requestKey);
					reject(new Error(`GET_RECEIPTS request timed out (reqId=${reqId})`));
				}
			}, this.timeout);

			this.resolvers.set(reqId, {
				resolve: (value: unknown) => {
					clearTimeout(timeout);
					this.inFlightRequests.delete(requestKey);
					const result = value as [bigint, TxReceipt[]];
					resolve(result);
				},
				reject: (err) => {
					clearTimeout(timeout);
					this.inFlightRequests.delete(requestKey);
					reject(err);
				},
				timeout,
			});
		});

		this.inFlightRequests.set(requestKey, promise);
		return promise;
	}

	/**
	 * Send ETH protocol message (for announcements and responses)
	 * Implements EthProtocolMethods.send()
	 */
	send(name: string, args?: unknown): void {
		// Map message name to code
		const nameToCode: Record<string, EthMessageCode> = {
			Status: EthMessageCode.STATUS,
			NewBlockHashes: EthMessageCode.NEW_BLOCK_HASHES,
			Transactions: EthMessageCode.TRANSACTIONS,
			GetBlockHeaders: EthMessageCode.GET_BLOCK_HEADERS,
			BlockHeaders: EthMessageCode.BLOCK_HEADERS,
			GetBlockBodies: EthMessageCode.GET_BLOCK_BODIES,
			BlockBodies: EthMessageCode.BLOCK_BODIES,
			NewBlock: EthMessageCode.NEW_BLOCK,
			NewPooledTransactionHashes: EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
			GetPooledTransactions: EthMessageCode.GET_POOLED_TRANSACTIONS,
			PooledTransactions: EthMessageCode.POOLED_TRANSACTIONS,
			GetNodeData: EthMessageCode.GET_NODE_DATA,
			NodeData: EthMessageCode.NODE_DATA,
			GetReceipts: EthMessageCode.GET_RECEIPTS,
			Receipts: EthMessageCode.RECEIPTS,
		};

		const code = nameToCode[name];
		if (code === undefined) {
			throw new Error(`Unknown message name: ${name}`);
		}

		// Get message definition
		const messageDef = ETH_MESSAGES[code];
		if (!messageDef) {
			throw new Error(`No message definition for code: ${code}`);
		}

		// Encode data using protocol definitions
		let encodedData: any;
		if (messageDef.encode) {
			// Handle different argument formats based on message type
			if (name === "NewBlock" && Array.isArray(args)) {
				// NewBlock: [block, td] - encode takes tuple
				const encodeFn = messageDef.encode as (args: [any, bigint]) => any;
				encodedData = encodeFn(args as [any, bigint]);
			} else if (name === "NewBlockHashes" && Array.isArray(args)) {
				// NewBlockHashes: array of [hash, number] - encode takes array
				const encodeFn = messageDef.encode as (args: any[]) => any;
				encodedData = encodeFn(args as any[]);
			} else if (name === "Transactions" && Array.isArray(args)) {
				// Transactions: array of transactions - encode takes array
				const encodeFn = messageDef.encode as (args: TypedTransaction[]) => any;
				encodedData = encodeFn(args as TypedTransaction[]);
			} else if (name === "NewPooledTransactionHashes" && Array.isArray(args)) {
				// NewPooledTransactionHashes: can be array or tuple
				const encodeFn = messageDef.encode as (
					params:
						| Uint8Array[]
						| [types: number[], sizes: number[], hashes: Uint8Array[]],
				) => any;
				encodedData = encodeFn(args as any);
			} else if (typeof args === "object" && args !== null) {
				// Object format: { reqId, headers }, { reqId, bodies }, etc.
				const encodeFn = messageDef.encode as (args: any) => any;
				encodedData = encodeFn(args as any);
			} else {
				const encodeFn = messageDef.encode as (args: any) => any;
				encodedData = encodeFn(args as any);
			}
		} else {
			encodedData = args;
		}

		// Send via wire module (encodes and sends via RLPxConnection)
		this.sendMessage(code, encodedData);
	}

	/**
	 * Request with response (for compatibility with BoundProtocol interface)
	 * Implements EthProtocolMethods.request()
	 */
	async request(name: string, args?: unknown): Promise<unknown> {
		// Check if this is a request/response message or an announcement
		const responseMessages = [
			"BlockHeaders",
			"BlockBodies",
			"PooledTransactions",
			"Receipts",
			"NodeData",
		];
		const requestMessages = [
			"GetBlockHeaders",
			"GetBlockBodies",
			"GetPooledTransactions",
			"GetReceipts",
			"GetNodeData",
		];

		// If it's an announcement (like "Transactions"), just send it
		if (!requestMessages.includes(name) && !responseMessages.includes(name)) {
			this.send(name, args);
			return Promise.resolve(undefined);
		}

		// For actual requests, use the specific methods
		if (name === "GetBlockHeaders") {
			return this.getBlockHeaders(args as any);
		} else if (name === "GetBlockBodies") {
			return this.getBlockBodies(args as any);
		} else if (name === "GetPooledTransactions") {
			return this.getPooledTransactions(args as any);
		} else if (name === "GetReceipts") {
			return this.getReceipts(args as any);
		}

		// Fallback: just send
		this.send(name, args);
		return Promise.resolve(undefined);
	}

	/**
	 * Handle message queue (no-op for compatibility)
	 * Implements EthProtocolMethods.handleMessageQueue()
	 */
	handleMessageQueue(): void {
		// No-op - messages handled directly via registry
	}

	/**
	 * Get peer status (for EthProtocolMethods interface)
	 */
	get status(): EthStatus | null {
		return this._peerStatus;
	}

	/**
	 * Check if STATUS exchange completed
	 */
	get isReady(): boolean {
		return this._statusExchanged;
	}
}
