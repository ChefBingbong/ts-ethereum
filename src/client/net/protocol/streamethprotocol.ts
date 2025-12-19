import {
	type BlockBodyBytes,
	type BlockBytes,
	type BlockHeader,
	createBlockFromBytesArray
} from "../../../block";
import type { Registrar } from "../../../p2p/connection/registrar.ts";
import type { MplexStream } from "../../../p2p/muxer/index.ts";
import * as RLP from "../../../rlp";
import {
	isLegacyTx,
	type TypedTransaction
} from "../../../tx";
import {
	BIGINT_0,
	bigIntToUnpaddedBytes,
	bytesToBigInt,
	bytesToHex,
	bytesToInt,
	intToUnpaddedBytes
} from "../../../utils";
import {
	encodeReceipt
} from "../../../vm";
import type { Chain } from "../../blockchain";
import type { TxReceiptWithType } from "../../execution/receipt.ts";
import { Event } from "../../types.ts";
import { Protocol, type ProtocolOptions } from "./protocol.ts";

// Log type for receipts
type Log = [address: Uint8Array, topics: Uint8Array[], data: Uint8Array];

export interface StreamEthProtocolOptions extends ProtocolOptions {
	chain: Chain;
	registrar?: Registrar;
}

type GetBlockHeadersOpts = {
	reqId?: bigint;
	block: bigint | Uint8Array;
	max: number;
	skip?: number;
	reverse?: boolean;
};

type GetBlockBodiesOpts = {
	reqId?: bigint;
	hashes: Uint8Array[];
};

type GetPooledTransactionsOpts = {
	reqId?: bigint;
	hashes: Uint8Array[];
};

type GetReceiptsOpts = {
	reqId?: bigint;
	hashes: Uint8Array[];
};

/**
 * Stream-based ETH protocol implementation
 * Supports eth/66, eth/67, eth/68 over multiplexed streams
 */
export class StreamEthProtocol extends Protocol {
	private chain: Chain;
	private registrar: Registrar;
	private nextReqId = BIGINT_0;
	
	// Protocol identifiers
	public static readonly ETH_66 = "/eth/66/1.0.0";
	public static readonly ETH_67 = "/eth/67/1.0.0";
	public static readonly ETH_68 = "/eth/68/1.0.0";

	// Message codes (matching eth/66+ spec)
	private static readonly MSG_STATUS = 0x00;
	private static readonly MSG_NEW_BLOCK_HASHES = 0x01;
	private static readonly MSG_TRANSACTIONS = 0x02;
	private static readonly MSG_GET_BLOCK_HEADERS = 0x03;
	private static readonly MSG_BLOCK_HEADERS = 0x04;
	private static readonly MSG_GET_BLOCK_BODIES = 0x05;
	private static readonly MSG_BLOCK_BODIES = 0x06;
	private static readonly MSG_NEW_BLOCK = 0x07;
	private static readonly MSG_NEW_POOLED_TX_HASHES = 0x08;
	private static readonly MSG_GET_POOLED_TXS = 0x09;
	private static readonly MSG_POOLED_TXS = 0x0a;
	private static readonly MSG_GET_RECEIPTS = 0x0f;
	private static readonly MSG_RECEIPTS = 0x10;

	constructor(options: StreamEthProtocolOptions) {
		super(options);
		this.chain = options.chain;
		this.registrar = options.registrar!;
	}

	/**
	 * Set the registrar (called by server after initialization)
	 */
	setRegistrar(registrar: Registrar) {
		this.registrar = registrar;
	}

	/**
	 * Name of protocol
	 */
	get name() {
		return "eth";
	}

	/**
	 * Protocol versions supported
	 */
	override get versions() {
		return [66, 67, 68];
	}

	/**
	 * Messages defined by this protocol
	 * (For compatibility with Protocol base class - not used in stream-based impl)
	 */
	override get messages() {
		return [];
	}

	/**
	 * Get protocol strings for all versions
	 */
	getProtocolStrings(): string[] {
		return [
			StreamEthProtocol.ETH_66,
			StreamEthProtocol.ETH_67,
			StreamEthProtocol.ETH_68,
		];
	}

	/**
	 * Open protocol
	 */
	override async open(): Promise<void> {
		if (this.opened) {
			return;
		}
		await this.chain.open();
		this.registerHandlers();
		this.opened = true;
	}

	/**
	 * Register protocol handlers with registrar
	 */
	private registerHandlers() {
		if (!this.registrar) {
			this.config.logger?.error(
				"❌ StreamEthProtocol: Registrar not set, CANNOT register handlers!",
			);
			return;
		}

		const protocols = this.getProtocolStrings();
		this.config.logger?.info(
			`📝 Registering ETH protocol handlers: ${protocols.join(", ")}`,
		);

		// Register handlers for each protocol version
		for (const protocol of protocols) {
			this.registrar.handle(protocol, this.handleStream.bind(this));
			this.config.logger?.info(`✅ Registered handler for ${protocol}`);
		}

		// Verify registration
		const registered = this.registrar.getProtocols();
		this.config.logger?.info(
			`✅ Registrar now has ${registered.length} protocol(s): ${registered.join(", ")}`,
		);
	}

	/**
	 * Handle incoming stream (persistent - don't close!)
	 */
	private async handleStream(stream: MplexStream) {
		this.config.logger?.info(
			`📨 Inbound ETH stream opened: ${stream.id} (protocol: ${stream.protocol}) - keeping alive for persistent communication`,
		);

		// IMPORTANT: Attach message listener IMMEDIATELY
		stream.addEventListener("message", async (evt: any) => {
			try {
				// Extract data
				if (!evt.data) {
					return;
				}

				let data: Uint8Array;
				if (typeof evt.data.subarray === 'function') {
					data = evt.data.subarray();
				} else if (evt.data instanceof Uint8Array) {
					data = evt.data;
				} else {
					return;
				}

				if (data.length < 2) {
					return;
				}

				this.config.logger?.info(
					`📥 Received message on stream ${stream.id}: ${data.length} bytes`,
				);

				await this.handleMessage(stream, data);
			} catch (err: any) {
				this.config.logger?.error(
					`❌ Error handling message: ${err.message}`,
				);
			}
		});

		stream.addEventListener("close", () => {
			this.config.logger?.info(
				`📪 ETH stream closed: ${stream.id}`,
			);
		});

		stream.addEventListener("error", (evt: any) => {
			this.config.logger?.error(
				`❌ ETH stream error on ${stream.id}: ${evt.error?.message || "unknown"}`,
			);
		});

		// DON'T close this stream - it stays open for ongoing requests/responses!
		// The peer will manage its lifecycle
	}

	/**
	 * Handle a message received on a stream
	 */
	private async handleMessage(stream: MplexStream, data: Uint8Array) {
		// First byte is message code
		const code = data[0];
		const payload = data.slice(1);

		const messageNames: Record<number, string> = {
			0x00: "STATUS",
			0x01: "NEW_BLOCK_HASHES",
			0x02: "TRANSACTIONS",
			0x03: "GET_BLOCK_HEADERS",
			0x04: "BLOCK_HEADERS",
			0x05: "GET_BLOCK_BODIES",
			0x06: "BLOCK_BODIES",
			0x07: "NEW_BLOCK",
			0x08: "NEW_POOLED_TX_HASHES",
			0x09: "GET_POOLED_TXS",
			0x0a: "POOLED_TXS",
			0x0f: "GET_RECEIPTS",
			0x10: "RECEIPTS",
		};

		this.config.logger?.info(
			`📥 Processing message: ${messageNames[code] || `0x${code.toString(16)}`} (${payload.length} bytes payload, hex: ${bytesToHex(payload).slice(0, 40)}...)`,
		);

		// Decode RLP payload
		let decoded: any;
		try {
			decoded = RLP.decode(payload);
			this.config.logger?.debug(
				`RLP decoded: type=${Array.isArray(decoded) ? 'array' : typeof decoded}, length=${Array.isArray(decoded) ? decoded.length : 'N/A'}`,
			);
		} catch (err: any) {
			this.config.logger?.error(
				`❌ Failed to decode RLP payload: ${err.message}`,
			);
			return;
		}

		switch (code) {
			case StreamEthProtocol.MSG_STATUS:
				await this.handleStatus(stream, decoded);
				break;
			case StreamEthProtocol.MSG_GET_BLOCK_HEADERS:
				await this.handleGetBlockHeaders(stream, decoded);
				break;
			case StreamEthProtocol.MSG_GET_BLOCK_BODIES:
				await this.handleGetBlockBodies(stream, decoded);
				break;
			case StreamEthProtocol.MSG_GET_POOLED_TXS:
				await this.handleGetPooledTransactions(stream, decoded);
				break;
			case StreamEthProtocol.MSG_GET_RECEIPTS:
				await this.handleGetReceipts(stream, decoded);
				break;
			case StreamEthProtocol.MSG_NEW_BLOCK:
				// NewBlock announcement - needs to be handled by FullSynchronizer
				await this.handleNewBlock(stream, decoded);
				break;
			case StreamEthProtocol.MSG_NEW_BLOCK_HASHES:
			case StreamEthProtocol.MSG_TRANSACTIONS:
			case StreamEthProtocol.MSG_NEW_POOLED_TX_HASHES:
				// Other announcements
				this.config.logger?.info(
					`📢 Received announcement: ${messageNames[code]}`,
				);
				break;
			default:
				this.config.logger?.warn(`❓ Unknown ETH message code: 0x${code.toString(16)}`);
		}
	}

	/**
	 * Handle NEW_BLOCK announcement
	 * Format: [block, td]
	 * NOTE: This is called on inbound streams where we don't have direct peer context
	 * We need to find the peer and emit PROTOCOL_MESSAGE event
	 */
	private async handleNewBlock(stream: MplexStream, decoded: any) {
		try {
			const [blockRaw, tdBytes] = decoded as [BlockBytes, Uint8Array];
			
			// Parse block
			const block = createBlockFromBytesArray(blockRaw, {
				common: this.config.chainCommon,
			});
			
			const td = bytesToBigInt(tdBytes);
			
			this.config.logger?.info(
				`📦 NEW_BLOCK received: height=${block.header.number}, hash=${bytesToHex(block.hash()).slice(0, 18)}..., td=${td}`,
			);
			
			// CRITICAL: Emit PROTOCOL_MESSAGE event so FullSynchronizer can handle it
			// The event handler in FullEthereumService will process it
			const eventEmitted = this.config.events.emit(
				Event.PROTOCOL_MESSAGE,
				{ name: 'NewBlock', data: [block, td] },
				'eth',
				null  // Peer context not available on inbound stream
			);
			
			this.config.logger?.info(
				`✅ Emitted PROTOCOL_MESSAGE event for NewBlock at height=${block.header.number}, listeners=${this.config.events.listenerCount(Event.PROTOCOL_MESSAGE)}`,
			);
			
			if (!eventEmitted) {
				this.config.logger?.error(
					`❌ PROTOCOL_MESSAGE event NOT emitted - no listeners!`,
				);
			}
			
		} catch (err: any) {
			this.config.logger?.error(
				`Error handling NewBlock: ${err.message}`,
			);
		}
	}

	/**
	 * Handle STATUS message
	 * Format: [version, chainId, td, bestHash, genesisHash]
	 */
	private async handleStatus(stream: MplexStream, decoded: any) {
		if (!Array.isArray(decoded) || decoded.length < 5) {
			this.config.logger?.error(
				`❌ Invalid STATUS format: expected array with 5+ elements, got ${typeof decoded}`,
			);
			stream.close();
			return;
		}

		const [version, chainId, td, bestHash, genesisHash] = decoded;

		const status = {
			version: bytesToInt(version),
			chainId: bytesToBigInt(chainId),
			td: bytesToBigInt(td),
			bestHash: bestHash,
			genesisHash: genesisHash,
		};

		this.config.logger?.info(
			`✅ Received STATUS: version=eth/${status.version}, chainId=${status.chainId}, td=${status.td}, genesis=${bytesToHex(status.genesisHash).slice(0, 18)}...`,
		);
		
		// Verify genesis hash matches
		const ourGenesis = this.chain.genesis.hash();
		const theirGenesisHex = bytesToHex(status.genesisHash);
		const ourGenesisHex = bytesToHex(ourGenesis);
		if (theirGenesisHex !== ourGenesisHex) {
			this.config.logger?.error(
				`❌ Genesis mismatch! Theirs: ${theirGenesisHex.slice(0, 18)}... Ours: ${ourGenesisHex.slice(0, 18)}...`,
			);
			stream.close();
			return;
		}

		this.config.logger?.info(
			`✅ Peer status validated - handshake complete!`,
		);
	}

	/**
	 * Handle GetBlockHeaders request
	 */
	private async handleGetBlockHeaders(stream: MplexStream, decoded: any) {
		const [reqId, [block, max, skip, reverse]] = decoded as [
			Uint8Array,
			[Uint8Array, Uint8Array, Uint8Array, Uint8Array],
		];

		const request = {
			reqId: bytesToBigInt(reqId),
			block: block.length === 32 ? block : bytesToBigInt(block),
			max: bytesToInt(max),
			skip: bytesToInt(skip),
			reverse: bytesToInt(reverse) === 0 ? false : true,
		};

		this.config.logger?.info(
			`📨 GetBlockHeaders request: reqId=${request.reqId}, block=${request.block}, max=${request.max}`,
		);

		// Get headers from blockchain
		const headers: BlockHeader[] = [];
		try {
			let currentNum: bigint;

			// If block is a hash, find its number
			if (typeof request.block !== 'bigint') {
				try {
					const blockByHash = await this.chain.getBlock(request.block);
					currentNum = blockByHash.header.number;
				} catch {
					// Hash not found, return empty
					this.config.logger?.debug(
						`Block hash not found, returning empty`,
					);
					await this.sendBlockHeaders(stream, {
						reqId: request.reqId,
						headers: [],
					});
					return;
				}
			} else {
				currentNum = request.block;
			}

			// Collect headers
			for (let i = 0; i < request.max; i++) {
				try {
					const block = await this.chain.getBlock(currentNum);
					headers.push(block.header);

					// Calculate next block number
					if (request.reverse) {
						if (currentNum === 0n) break;
						currentNum = currentNum - BigInt(request.skip + 1);
					} else {
						currentNum = currentNum + BigInt(request.skip + 1);
					}
				} catch {
					// Block not found, stop
					break;
				}
			}

			this.config.logger?.info(
				`📤 Sending ${headers.length} headers for reqId=${request.reqId}`,
			);
		} catch (err: any) {
			this.config.logger?.error(
				`Error getting headers: ${err.message}`,
			);
		}

		await this.sendBlockHeaders(stream, {
			reqId: request.reqId,
			headers,
		});
	}

	/**
	 * Handle GetBlockBodies request
	 */
	private async handleGetBlockBodies(stream: MplexStream, decoded: any) {
		const [reqId, hashes] = decoded as [Uint8Array, Uint8Array[]];

		const request = {
			reqId: bytesToBigInt(reqId),
			hashes,
		};

		this.config.logger?.info(
			`📨 GetBlockBodies request: reqId=${request.reqId}, hashes=${request.hashes.length}`,
		);

		// Get bodies from blockchain
		const bodies: BlockBodyBytes[] = [];
		try {
			for (const hash of request.hashes) {
				try {
					const block = await this.chain.getBlock(hash);
					// BlockBodyBytes = [transactions, uncles]
					bodies.push([block.transactions.map((tx) => tx.raw()), block.uncleHeaders.map((h) => h.raw())]);
				} catch {
					// Block not found, skip
					continue;
				}
			}

			this.config.logger?.info(
				`📤 Sending ${bodies.length} bodies for reqId=${request.reqId}`,
			);
		} catch (err: any) {
			this.config.logger?.error(
				`Error getting bodies: ${err.message}`,
			);
		}

		await this.sendBlockBodies(stream, {
			reqId: request.reqId,
			bodies,
		});
	}

	/**
	 * Handle GetPooledTransactions request
	 */
	private async handleGetPooledTransactions(
		stream: MplexStream,
		decoded: any,
	) {
		const [reqId, hashes] = decoded as [Uint8Array, Uint8Array[]];

		const request = {
			reqId: bytesToBigInt(reqId),
			hashes,
		};

		// TODO: Implement actual pooled transaction retrieval
		const txs: TypedTransaction[] = [];

		await this.sendPooledTransactions(stream, {
			reqId: request.reqId,
			txs,
		});
	}

	/**
	 * Handle GetReceipts request
	 */
	private async handleGetReceipts(stream: MplexStream, decoded: any) {
		const [reqId, hashes] = decoded as [Uint8Array, Uint8Array[]];

		const request = {
			reqId: bytesToBigInt(reqId),
			hashes,
		};

		// TODO: Implement actual receipt retrieval
		const receipts: TxReceiptWithType[] = [];

		await this.sendReceipts(stream, {
			reqId: request.reqId,
			receipts,
		});
	}

	/**
	 * Send a message over a stream
	 */
	private async sendMessage(
		stream: MplexStream,
		code: number,
		payload: any,
	) {
		try {
			// Payload should be RLP-compatible (arrays of Uint8Arrays)
			const encoded = RLP.encode(payload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = code;
			message.set(encoded, 1);
			
			this.config.logger?.info(
				`📤 Sending message code=0x${code.toString(16)} payload=${encoded.length} bytes, total=${message.length} bytes, hex=${bytesToHex(message).slice(0, 40)}...`,
			);
			
			stream.send(message);
		} catch (err: any) {
			this.config.logger?.error(
				`Failed to encode message code=0x${code.toString(16)}: ${err.message}`,
			);
			throw err;
		}
	}

	/**
	 * Send STATUS message
	 * Format: [version, chainId, td, bestHash, genesisHash]
	 */
	async sendStatus(stream: MplexStream) {
		// Determine protocol version from stream protocol string
		const protocolVersion = stream.protocol.includes('/eth/68') ? 68
			: stream.protocol.includes('/eth/67') ? 67
			: 66;

		// STATUS is sent as an array (RLP format from eth protocol)
		const status = [
			intToUnpaddedBytes(protocolVersion),
			bigIntToUnpaddedBytes(this.chain.chainId),
			bigIntToUnpaddedBytes(this.chain.blocks.td),
			this.chain.blocks.latest!.hash(),
			this.chain.genesis.hash(),
		];

		this.config.logger?.info(
			`📤 Sending STATUS: version=eth/${protocolVersion}, chainId=${this.chain.chainId}, td=${this.chain.blocks.td}, bestHash=${bytesToHex(this.chain.blocks.latest!.hash()).slice(0, 18)}...`,
		);
		await this.sendMessage(stream, StreamEthProtocol.MSG_STATUS, status);
		this.config.logger?.info(`✅ STATUS message sent on stream ${stream.id}`);
	}

	/**
	 * Send BlockHeaders response (don't close stream - keep it alive!)
	 */
	async sendBlockHeaders(
		stream: MplexStream,
		opts: { reqId: bigint; headers: BlockHeader[] },
	) {
		const payload = [
			bigIntToUnpaddedBytes(opts.reqId),
			opts.headers.map((h) => h.raw()),
		];
		await this.sendMessage(
			stream,
			StreamEthProtocol.MSG_BLOCK_HEADERS,
			payload,
		);
		// DON'T close stream - keep it open for ongoing communication
	}

	/**
	 * Send BlockBodies response (don't close stream - keep it alive!)
	 */
	async sendBlockBodies(
		stream: MplexStream,
		opts: { reqId: bigint; bodies: BlockBodyBytes[] },
	) {
		const payload = [bigIntToUnpaddedBytes(opts.reqId), opts.bodies];
		await this.sendMessage(
			stream,
			StreamEthProtocol.MSG_BLOCK_BODIES,
			payload,
		);
		// DON'T close stream - keep it open for ongoing communication
	}

	/**
	 * Send PooledTransactions response (don't close stream - keep it alive!)
	 */
	async sendPooledTransactions(
		stream: MplexStream,
		opts: { reqId: bigint; txs: TypedTransaction[] },
	) {
		const serializedTxs = [];
		for (const tx of opts.txs) {
			if (isLegacyTx(tx)) {
				serializedTxs.push(tx.raw());
			}
		}

		const payload = [bigIntToUnpaddedBytes(opts.reqId), serializedTxs];
		await this.sendMessage(
			stream,
			StreamEthProtocol.MSG_POOLED_TXS,
			payload,
		);
		// DON'T close stream - keep it open for ongoing communication
	}

	/**
	 * Send Receipts response (don't close stream - keep it alive!)
	 */
	async sendReceipts(
		stream: MplexStream,
		opts: { reqId: bigint; receipts: TxReceiptWithType[] },
	) {
		const serializedReceipts = [];
		for (const receipt of opts.receipts) {
			const encodedReceipt = encodeReceipt(receipt, receipt.txType);
			serializedReceipts.push(encodedReceipt);
		}

		const payload = [bigIntToUnpaddedBytes(opts.reqId), serializedReceipts];
		await this.sendMessage(stream, StreamEthProtocol.MSG_RECEIPTS, payload);
		// DON'T close stream - keep it open for ongoing communication
	}

	/**
	 * Encode status into ETH status message payload
	 */
	override encodeStatus(): any {
		return {
			chainId: bigIntToUnpaddedBytes(this.chain.chainId),
			td: bigIntToUnpaddedBytes(this.chain.blocks.td),
			bestHash: this.chain.blocks.latest!.hash(),
			genesisHash: this.chain.genesis.hash(),
			latestBlock: bigIntToUnpaddedBytes(
				this.chain.blocks.latest!.header.number,
			),
		};
	}

	/**
	 * Decode ETH status message payload into a status object
	 */
	override decodeStatus(status: any): any {
		return {
			chainId: bytesToBigInt(status.chainId),
			td: bytesToBigInt(status.td),
			bestHash: status.bestHash,
			genesisHash: status.genesisHash,
		};
	}
}

