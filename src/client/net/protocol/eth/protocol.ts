import type { BlockBodyBytes, BlockHeader } from "../../../../block";
import { assertEq, formatLogId } from "../../../../devp2p/util";
import type { BasicConnection } from "../../../../p2p/connection/basic-connection";
import * as RLP from "../../../../rlp";
import type { TypedTransaction } from "../../../../tx";
import {
	BIGINT_0,
	bigIntToBytes,
	bigIntToUnpaddedBytes,
	bytesToBigInt,
	bytesToHex,
	bytesToInt,
	hexToBytes,
	intToBytes,
	isHexString,
} from "../../../../utils";
import type { TxReceipt } from "../../../../vm";
import type { Chain } from "../../../blockchain";
import { AbstractProtocol } from "../abstract-protocol.ts";
import { RlpxProtocolAdapter } from "../rlpx-protocol-adapter";

// import type { ETH as Devp2pETH } from "../../../../devp2p"; // TODO: Migrate away from devp2p
type Devp2pETH = any; // Temporary type stub until migration complete

// import { ProtocolOptions as BaseProtocolOptions } from "../protocol.ts";
import {
	EthMessageCode,
	EthMessageType,
	EthProtocolSpec,
	ProtocolOptions,
	ProtocolSpec,
} from "./definitions.ts";
import {
	GetBlockBodiesHandler,
	GetBlockHeadersHandler,
	GetNodeDataHandler,
	GetPooledTransactionsHandler,
	GetReceiptsHandler,
	type Handler,
	NewBlockHandler,
	NewBlockHashesHandler,
	NewPooledTransactionHashesHandler,
	StatusHandler,
	TransactionsHandler,
} from "./handlers/index.ts";

export interface EthStatusMsg extends Array<Uint8Array | Uint8Array[]> {}

export interface Sender {
	sendStatus(status: any): void;
	sendMessage(code: number, data: Uint8Array): void;
	status?: any;
	once(event: string, handler: (data: any) => void): void;
}

export class EthProtocol extends AbstractProtocol<ProtocolOptions> {
	public chain: Chain;
	public nextReqId = BIGINT_0;
	private _statusRaw: EthStatusMsg | null = null;
	private _peerStatus: EthStatusMsg | null = null;
	private _version: number;
	public DEBUG: boolean = false;
	private _hardfork: string = "chainstart";
	private _latestBlock = BIGINT_0;
	private _forkHash: string = "";
	private _nextForkBlock = BIGINT_0;
	private handlers: Map<number, Handler> = new Map();
	private devp2pEth?: Devp2pETH; // Legacy devp2p support (to be removed)
	private protocolAdapter?: RlpxProtocolAdapter; // New adapter for BasicConnection
	public updatedBestHeader?: BlockHeader;
	private ethSpec: EthProtocolSpec; // Store the original ETH spec for access to options

	constructor(options: {
		spec: EthProtocolSpec;
		chain: Chain;
		config: any;
		version?: number;
		service?: any;
	}) {
		const protocolSpec: ProtocolSpec<ProtocolOptions> = {
			name: options.spec.name,
			versions: options.spec.versions,
			defaultVersion: options.spec.defaultVersion,
			messages: options.spec.messages as Record<number, any>,
			versionCapabilities: options.spec.versionCapabilities as Record<
				number,
				any
			>,
			transportRequirements: options.spec.transportRequirements as Record<
				string,
				any
			>,
			options: {
				config: options.config,
				timeout: 8000, // Default timeout
			},
		};
		super(protocolSpec);

		this.ethSpec = options.spec; // Store original spec
		this.chain = options.chain;
		this._version = options.version ?? options.spec.defaultVersion;
		this._service = options.service ?? null;
		this.DEBUG = process?.env?.DEBUG?.includes("ethjs") ?? false;

		if (this._version >= 64) {
			const c = this.config.chainCommon;
			this._hardfork = c.hardfork() ?? this._hardfork;
			this._latestBlock = BIGINT_0;
			this._nextForkBlock = BIGINT_0;
		}

		this._setupHandlers();
	}

	private _setupHandlers(): void {
		this.handlers.set(EthMessageCode.STATUS, new StatusHandler(this));
		this.handlers.set(
			EthMessageCode.NEW_BLOCK_HASHES,
			new NewBlockHashesHandler(this),
		);
		this.handlers.set(
			EthMessageCode.TRANSACTIONS,
			new TransactionsHandler(this),
		);
		this.handlers.set(
			EthMessageCode.GET_BLOCK_HEADERS,
			new GetBlockHeadersHandler(this),
		);
		this.handlers.set(
			EthMessageCode.BLOCK_HEADERS,
			new GetBlockHeadersHandler(this),
		);
		this.handlers.set(
			EthMessageCode.GET_BLOCK_BODIES,
			new GetBlockBodiesHandler(this),
		);
		this.handlers.set(
			EthMessageCode.BLOCK_BODIES,
			new GetBlockBodiesHandler(this),
		);
		this.handlers.set(EthMessageCode.NEW_BLOCK, new NewBlockHandler(this));
		this.handlers.set(
			EthMessageCode.GET_RECEIPTS,
			new GetReceiptsHandler(this),
		);
		this.handlers.set(EthMessageCode.RECEIPTS, new GetReceiptsHandler(this));
		this.handlers.set(
			EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
			new NewPooledTransactionHashesHandler(this),
		);
		this.handlers.set(
			EthMessageCode.GET_POOLED_TRANSACTIONS,
			new GetPooledTransactionsHandler(this),
		);
		this.handlers.set(
			EthMessageCode.POOLED_TRANSACTIONS,
			new GetPooledTransactionsHandler(this),
		);
		this.handlers.set(
			EthMessageCode.GET_NODE_DATA,
			new GetNodeDataHandler(this),
		);
		this.handlers.set(EthMessageCode.NODE_DATA, new GetNodeDataHandler(this));
	}

	async open(): Promise<boolean | void> {
		if (this.opened) {
			return false;
		}
		await this.chain.open();
		this.opened = true;
	}

	async handshake(sender: Sender): Promise<any> {
		const status = this.spec.messages[EthMessageCode.STATUS];
		if (!status) {
			throw new Error("STATUS message not found");
		}
		const statusOpts = {
			chainId: this.chain.chainId,
			td: this.chain.blocks.td,
			bestHash: this.chain.blocks.latest!.hash(),
			genesisHash: this.chain.genesis.hash(),
			latestBlock: this.chain.blocks.latest!.header.number,
		};
		// Don't set _statusRaw here - let handshakeInitiator handle it
		// Just pass the statusOpts and let the handler do the encoding and sending
		return this.send(EthMessageCode.STATUS, statusOpts, sender);
	}

	send(
		codeOrName: number | string,
		payload: any,
		sender?: Sender,
	): void | Promise<any> {
		// Support both message code (number) and message name (string)
		let code: number;
		if (typeof codeOrName === "string") {
			// Find code by name
			const found = Object.entries(this.spec.messages).find(
				([_, msg]: [string, any]) => msg.name === codeOrName,
			);
			if (!found) {
				throw new Error(`Unknown message name: ${codeOrName}`);
			}
			code = parseInt(found[0], 10);
		} else {
			code = codeOrName;
		}

		const handler = this.handlers.get(code);
		if (!handler) {
			throw new Error(`Unknown message code: ${code}`);
		}

		const message = this.spec.messages[code];
		if (!message) {
			throw new Error(`Message definition not found for code: ${code}`);
		}

		// Create a sender wrapper if we have transport but no sender provided
		const actualSender =
			sender ||
			(this.protocolAdapter
				? this._createSenderFromAdapter()
				: this._createSenderFromDevp2p());

		const messageType = (message as any).type;
		if (messageType === EthMessageType.REQUEST && handler.initiator) {
			// For requests, return the promise (caller handles it)
			return handler.initiator(payload, actualSender, this.timeout);
		} else if (messageType === EthMessageType.ANNOUNCEMENT && handler.send) {
			handler.send(payload, actualSender);
		} else if (
			messageType === EthMessageType.HANDSHAKE &&
			handler.handshakeInitiator
		) {
			return handler.handshakeInitiator(payload, actualSender, this.timeout);
		} else if (handler.send) {
			// Fallback for backward compatibility
			handler.send(payload, actualSender);
		}
	}

	private _createSenderFromDevp2p(): Sender {
		if (!this.devp2pEth) {
			throw new Error(
				"No transport context set up. Call setupTransport() first.",
			);
		}
		return {
			sendStatus: (status: any) => {
				this.devp2pEth!.sendStatus(status);
			},
			sendMessage: (code: number, data: Uint8Array) => {
				this.devp2pEth!.sendMessage(code as any, data);
			},
			status: (this.devp2pEth as any)._status,
			once: (event: string, handler: (data: any) => void) => {
				(this.devp2pEth!.events as any).once(event, handler);
			},
		};
	}

	private _createSenderFromAdapter(): Sender {
		if (!this.protocolAdapter) {
			throw new Error(
				"No transport context set up. Call setupTransport() first.",
			);
		}

		return {
			sendStatus: (status: any) => {
				this.protocolAdapter!.sendStatus(status);
			},
			sendMessage: (code: number, data: Uint8Array) => {
				this.protocolAdapter!.sendMessage(code, data);
			},
			status: undefined, // Will be set during handshake
			once: (event: string, handler: (data: any) => void) => {
				if (event === "status") {
					// Handle STATUS message specially
					const messageHandler = (msgCode: number, payload: Uint8Array) => {
						if (msgCode === EthMessageCode.STATUS) {
							const decoded = RLP.decode(payload);
							handler(decoded);
						}
					};
					this.protocolAdapter!.once("message", messageHandler);
				} else {
					// For other events, listen on adapter
					this.protocolAdapter!.once(event, handler);
				}
			},
		};
	}

	handle(code: number, data: Uint8Array, context?: any): void {
		const handler = this.handlers.get(code);
		if (!handler) {
			return;
		}

		const payload = RLP.decode(data);
		const message = this.spec.messages[code];
		if (!message) {
			return;
		}

		// Create context with service dependencies if not provided
		const handlerContext = context || this._createHandlerContext();

		const messageType = (message as any).type;
		if (messageType === EthMessageType.REQUEST && handler.responder) {
			// Decode request using message definition
			const decodedRequest = message.decode(payload);
			handler.responder(decodedRequest, handlerContext);
		} else if (messageType === EthMessageType.RESPONSE) {
			// Decode response using message definition
			const decodedResponse = message.decode(payload, {
				chainCommon: this.config.chainCommon,
				synchronized: this.config.synchronized,
			});
			// Emit event for initiator to catch (use any cast for dynamic event names)
			(this as any).emit(`message:${code}`, decodedResponse);
			this.emit("message", code as any, decodedResponse);
		} else if (messageType === EthMessageType.ANNOUNCEMENT && handler.handle) {
			handler.handle(payload, handlerContext);
		} else if (
			messageType === EthMessageType.HANDSHAKE &&
			handler.handshakeResponder
		) {
			handler.handshakeResponder(payload, handlerContext);
		} else if (handler.handle) {
			// Fallback for backward compatibility
			handler.handle(payload, handlerContext);
		}
	}

	private _createHandlerContext(): any {
		if (!this._service || !this._peer) {
			return {};
		}
		return {
			chain: this.chain,
			peer: this._peer,
			txPool: this._service.txPool,
			execution: this._service.execution,
			peerPool: this._service.pool,
			synchronizer: this._service.synchronizer,
		};
	}

	public _handleStatus(): void {
		if (this._statusRaw === null || this._peerStatus === null) return;

		assertEq(
			this._statusRaw[0],
			this._peerStatus[0],
			"Protocol version mismatch",
			() => {},
			"STATUS",
		);
		assertEq(
			this._statusRaw[1],
			this._peerStatus[1],
			"NetworkId mismatch",
			() => {},
			"STATUS",
		);
		assertEq(
			this._statusRaw[4],
			this._peerStatus[4],
			"Genesis block mismatch",
			() => {},
			"STATUS",
		);

		const status: {
			chainId: Uint8Array | Uint8Array[];
			td: Uint8Array;
			bestHash: Uint8Array;
			genesisHash: Uint8Array;
			forkId?: Uint8Array | Uint8Array[];
		} = {
			chainId: this._peerStatus[1],
			td: this._peerStatus[2] as Uint8Array,
			bestHash: this._peerStatus[3] as Uint8Array,
			genesisHash: this._peerStatus[4] as Uint8Array,
			forkId: undefined,
		};

		if (this._version >= 64) {
			if (
				this._peerStatus[5] &&
				(this._peerStatus[5] as Uint8Array[]).length !== 2
			) {
				throw new Error("Incorrect forkId msg format");
			}
			status.forkId = this._peerStatus[5];
		}

		this.emit("status", status);
	}

	public _getStatusString(status: EthStatusMsg): string {
		let sStr = `[V:${bytesToInt(status[0] as Uint8Array)}, NID:${bytesToInt(
			status[1] as Uint8Array,
		)}, TD:${status[2].length === 0 ? 0 : bytesToBigInt(status[2] as Uint8Array).toString()}`;
		sStr += `, BestH:${formatLogId(
			bytesToHex(status[3] as Uint8Array),
			false,
		)}, GenH:${formatLogId(bytesToHex(status[4] as Uint8Array), false)}`;
		if (this._version >= 64 && status[5]) {
			sStr += `, ForkHash: ${
				status[5] !== undefined
					? bytesToHex((status[5] as Uint8Array[])[0] as Uint8Array)
					: "-"
			}`;
			sStr += `, ForkNext: ${
				((status[5] as Uint8Array[])[1] as Uint8Array).length > 0
					? bytesToHex((status[5] as Uint8Array[])[1] as Uint8Array)
					: "-"
			}`;
		}
		sStr += `]`;
		return sStr;
	}

	public _getMessageName(code: number): string {
		const message = this.spec.messages[code];
		return message?.name ?? `UNKNOWN(${code})`;
	}

	get peer(): any {
		return this._peer;
	}

	set peer(value: any) {
		this._peer = value;
	}

	get service(): any {
		return this._service;
	}

	set service(value: any) {
		this._service = value;
	}

	get version(): number {
		return this._version;
	}

	get peerStatus(): EthStatusMsg | null {
		return this._peerStatus;
	}

	set peerStatus(status: EthStatusMsg | null) {
		this._peerStatus = status;
	}

	get latestBlock(): bigint {
		return this._latestBlock;
	}

	set latestBlock(block: bigint) {
		this._latestBlock = block;
	}

	get forkHash(): string {
		return this._forkHash;
	}

	set forkHash(hash: string) {
		this._forkHash = hash;
	}

	get nextForkBlock(): bigint {
		return this._nextForkBlock;
	}

	set nextForkBlock(block: bigint) {
		this._nextForkBlock = block;
	}

	getHandler(code: number): Handler | undefined {
		return this.handlers.get(code);
	}

	setupTransport(transportContext: any): void {
		// Accept either BasicConnection, RlpxProtocolAdapter, or legacy devp2p ETH protocol
		if (!transportContext) {
			throw new Error(
				"Invalid transport context. Expected BasicConnection, RlpxProtocolAdapter, or devp2p ETH protocol instance.",
			);
		}

		// Check if it's a BasicConnection
		if (
			"underlyingStream" in transportContext &&
			"status" in transportContext
		) {
			const basicConn = transportContext as BasicConnection;
			// Create adapter from BasicConnection
			this.protocolAdapter = new RlpxProtocolAdapter(basicConn, 0);
			this.protocolAdapter.startListening();

			// Set up message handler
			this.protocolAdapter.on(
				"message",
				(code: number, payload: Uint8Array) => {
					if (code === EthMessageCode.STATUS) {
						// Handle STATUS specially for handshake
						const decoded = RLP.decode(payload);
						const handler = this.handlers.get(EthMessageCode.STATUS) as any;
						if (handler && handler.handshakeResponder) {
							handler
								.handshakeResponder(decoded)
								.then(() => {
									// After receiving STATUS, send our STATUS back if we haven't sent it yet
									if ((this as any)._statusRaw === null) {
										this.config.logger?.debug(
											`[EthProtocol] Sending STATUS response after receiving peer STATUS`,
										);
										// Build STATUS message directly (same as handshakeInitiator does)
										const statusOpts = {
											chainId: this.chain.chainId,
											td: this.chain.blocks.td,
											bestHash: this.chain.blocks.latest!.hash(),
											genesisHash: this.chain.genesis.hash(),
											latestBlock: this.chain.blocks.latest!.header.number,
										};
										const status: EthStatusMsg = [
											intToBytes(this.version),
											bigIntToBytes(this.chain.chainId),
											bigIntToUnpaddedBytes(statusOpts.td),
											statusOpts.bestHash,
											statusOpts.genesisHash,
										];
										if (this.version >= 64) {
											const forkHashB = hexToBytes(
												isHexString(this.forkHash)
													? this.forkHash
													: `0x${this.forkHash}`,
											);
											const nextForkB =
												this.nextForkBlock === BIGINT_0
													? new Uint8Array()
													: bigIntToBytes(this.nextForkBlock);
											status.push([forkHashB, nextForkB]);
										}
										// Mark that we're sending STATUS as a responder (not initiator)
										(this as any)._statusRaw = status;
										(this as any)._statusSentAsResponder = true;
										// Send STATUS response directly via adapter (bypass send() to avoid handshakeInitiator)
										this.protocolAdapter!.sendStatus(status);
										this.config.logger?.debug(
											`[EthProtocol] ✅ STATUS response sent`,
										);
									}
								})
								.catch((err: any) => {
									this.config.logger?.error(
										`[EthProtocol] Error handling STATUS: ${err.message}`,
									);
								});
						}
					} else {
						// Handle other messages normally
						this.handle(code, payload);
					}
				},
			);

			return;
		}

		// Check if it's already an RlpxProtocolAdapter
		if (transportContext instanceof RlpxProtocolAdapter) {
			this.protocolAdapter = transportContext;
			this.protocolAdapter.startListening();

			// Store adapter on protocol for access in bindProtocols
			(this as any).protocolAdapter = this.protocolAdapter;

			// Set up message handler
			this.protocolAdapter.on(
				"message",
				(code: number, payload: Uint8Array) => {
					if (code === EthMessageCode.STATUS) {
						const decoded = RLP.decode(payload);
						const handler = this.handlers.get(EthMessageCode.STATUS) as any;
						if (handler && handler.handshakeResponder) {
							handler.handshakeResponder(decoded);
						}
					} else {
						this.handle(code, payload);
					}
				},
			);

			return;
		}

		// Legacy: devp2p ETH protocol instance
		if (typeof transportContext.sendMessage === "function") {
			this.devp2pEth = transportContext as Devp2pETH;

			// Set up event listeners on devp2p ETH protocol
			this.devp2pEth.events.on(
				"message",
				(code: number, payload: Uint8Array) => {
					this.handle(code, payload);
				},
			);

			this.devp2pEth.events.on("status", (status: any) => {
				// Handle STATUS message - status is already decoded by devp2p
				const handler = this.handlers.get(EthMessageCode.STATUS) as any;
				if (handler && handler.handshakeResponder) {
					handler.handshakeResponder(status);
				}
			});

			return;
		}

		throw new Error(
			"Invalid transport context. Expected BasicConnection, RlpxProtocolAdapter, or devp2p ETH protocol instance.",
		);
	}

	// Methods for backward compatibility with BoundEthProtocol interface
	async getBlockHeaders(opts: {
		reqId?: bigint;
		block: bigint | Uint8Array;
		max: number;
		skip?: number;
		reverse?: boolean;
	}): Promise<[bigint, BlockHeader[]] | undefined> {
		const handler = this.handlers.get(
			EthMessageCode.GET_BLOCK_HEADERS,
		) as GetBlockHeadersHandler;
		if (!handler || !handler.initiator) {
			return undefined;
		}
		try {
			const sender = this.protocolAdapter
				? this._createSenderFromAdapter()
				: this._createSenderFromDevp2p();
			const headers = await handler.initiator(opts, sender, this.timeout);
			return [opts.reqId ?? ++this.nextReqId, headers];
		} catch (error: any) {
			this.config.logger?.error(`getBlockHeaders failed: ${error.message}`);
			return undefined;
		}
	}

	async getBlockBodies(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, BlockBodyBytes[]] | undefined> {
		const handler = this.handlers.get(
			EthMessageCode.GET_BLOCK_BODIES,
		) as GetBlockBodiesHandler;
		if (!handler || !handler.initiator) {
			return undefined;
		}
		try {
			const sender = this.protocolAdapter
				? this._createSenderFromAdapter()
				: this._createSenderFromDevp2p();
			const bodies = await handler.initiator(opts, sender, this.timeout);
			return [opts.reqId ?? ++this.nextReqId, bodies];
		} catch (error: any) {
			this.config.logger?.error(`getBlockBodies failed: ${error.message}`);
			return undefined;
		}
	}

	async getPooledTransactions(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, TypedTransaction[]] | undefined> {
		const handler = this.handlers.get(
			EthMessageCode.GET_POOLED_TRANSACTIONS,
		) as GetPooledTransactionsHandler;
		if (!handler || !handler.initiator) {
			return undefined;
		}
		try {
			const sender = this.protocolAdapter
				? this._createSenderFromAdapter()
				: this._createSenderFromDevp2p();
			const txs = await handler.initiator(opts, sender, this.timeout);
			return [opts.reqId ?? ++this.nextReqId, txs];
		} catch (error: any) {
			this.config.logger?.error(
				`getPooledTransactions failed: ${error.message}`,
			);
			return undefined;
		}
	}

	async getReceipts(opts: {
		reqId?: bigint;
		hashes: Uint8Array[];
	}): Promise<[bigint, TxReceipt[]] | undefined> {
		const handler = this.handlers.get(
			EthMessageCode.GET_RECEIPTS,
		) as GetReceiptsHandler;
		if (!handler || !handler.initiator) {
			return undefined;
		}
		try {
			const sender = this.protocolAdapter
				? this._createSenderFromAdapter()
				: this._createSenderFromDevp2p();
			const receipts = await handler.initiator(opts, sender, this.timeout);
			return [opts.reqId ?? ++this.nextReqId, receipts];
		} catch (error: any) {
			this.config.logger?.error(`getReceipts failed: ${error.message}`);
			return undefined;
		}
	}

	// Status property for backward compatibility (returns decoded status object)
	get status(): any {
		if (!this._statusRaw || !this._peerStatus) {
			return {};
		}
		return {
			chainId: bytesToBigInt(this._peerStatus[1] as Uint8Array),
			td: bytesToBigInt(this._peerStatus[2] as Uint8Array),
			bestHash: this._peerStatus[3] as Uint8Array,
			genesisHash: this._peerStatus[4] as Uint8Array,
		};
	}

	set status(value: any) {
		// Allow setting status for backward compatibility
		// This is mainly used internally
	}
}
