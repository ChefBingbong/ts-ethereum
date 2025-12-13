import { EventEmitter } from "eventemitter3";
import type { Block, BlockBodyBytes, BlockBytes, BlockHeader, BlockHeaderBytes } from "../../../block";
import { createBlockFromBytesArray, createBlockHeaderFromBytesArray } from "../../../block";
import type { Connection } from "../../../p2p/connection/connection.ts";
import * as RLP from "../../../rlp";
import type { TypedTransaction } from "../../../tx";
import { BIGINT_0, bigIntToUnpaddedBytes, bytesToBigInt, bytesToInt } from "../../../utils";
import type { TxReceipt } from "../../../vm";
import type { Config } from "../../config.ts";
import { Event } from "../../types.ts";
import type { StreamEthProtocol } from "./streamethprotocol.ts";

interface PendingRequest {
	resolve: Function;
	reject: Function;
	timeout: NodeJS.Timeout;
}

/**
 * Stream-based bound protocol that bridges StreamEthProtocol to BoundProtocol interface
 * This provides the methods that Synchronizer expects (getBlockHeaders, etc.)
 */
export class BoundStreamEthProtocol extends EventEmitter {
	public config: Config;
	public name: string = "eth";
	public _status: any = {};
	public updatedBestHeader?: BlockHeader;

	private connection: Connection;
	private protocol: StreamEthProtocol;
	private peerId: string;
	private peer: any;  // Reference to the P2PPeer
	private requestId: bigint = BIGINT_0;
	private pendingRequests: Map<bigint, PendingRequest> = new Map();
	private ethStream: any;  // The persistent ETH stream

	constructor(connection: Connection, protocol: StreamEthProtocol, peerId: string, config: Config, ethStream: any, peer?: any) {
		super();
		this.connection = connection;
		this.protocol = protocol;
		this.peerId = peerId;
		this.config = config;
		this.ethStream = ethStream;
		this.peer = peer;
		
		// Listen for ALL messages on the persistent stream
		this.ethStream.addEventListener('message', this.handleMessage.bind(this));
		
		this.config.logger?.info(
			`📡 BoundStreamEthProtocol listening for messages on stream ${this.ethStream.id}`,
		);
	}

	/**
	 * Set peer reference (called after peer is fully initialized)
	 */
	setPeer(peer: any) {
		this.peer = peer;
	}

	get status(): any {
		return this._status;
	}

	set status(status: any) {
		Object.assign(this._status, status);
	}

	/**
	 * Handle all messages on the persistent ETH stream
	 */
	private async handleMessage(evt: any) {
		try {
			// Extract data
			let data: Uint8Array;
			if (typeof evt.data?.subarray === 'function') {
				data = evt.data.subarray();
			} else if (evt.data instanceof Uint8Array) {
				data = evt.data;
			} else {
				return;
			}

			if (data.length < 2) return;

			// Parse message
			const code = data[0];
			const payload = data.slice(1);
			const decoded = RLP.decode(payload);
			// Route by message code
			switch (code) {
				case 0x00: // STATUS
					this.handleStatusMessage(decoded);
					break;
				case 0x04: // BlockHeaders
console.log("Received message", code, decoded);

					this.handleBlockHeadersMessage(decoded);
					break;
				case 0x06: // BlockBodies
					this.handleBlockBodiesMessage(decoded);
					break;
				case 0x07: // NewBlock
					this.handleNewBlockMessage(decoded);
					break;
				case 0x0a: // PooledTransactions
					this.handlePooledTransactionsMessage(decoded);
					break;
				case 0x10: // Receipts
					this.handleReceiptsMessage(decoded);
					break;
				default:
					this.config.logger?.debug(
						`Unhandled message code: 0x${code.toString(16)}`,
					);
			}
		} catch (err: any) {
			this.config.logger?.error(
				`Error handling message on persistent stream: ${err.message}`,
			);
		}
	}

	private handleStatusMessage(decoded: any) {
		if (!Array.isArray(decoded) || decoded.length < 5) return;
		
		const [version, chainId, td, bestHash, genesisHash] = decoded as any[];
		this.status = {
			version: bytesToInt(version),
			chainId: bytesToBigInt(chainId),
			td: bytesToBigInt(td),
			bestHash: bestHash,
			genesisHash: genesisHash,
		};

		this.config.logger?.info(
			`✅ Received STATUS: chainId=${this.status.chainId}, td=${this.status.td}`,
		);
	}

	private handleBlockHeadersMessage(decoded: any) {
		const [reqIdBytes, headersRaw] = decoded as [Uint8Array, BlockHeaderBytes[]];
		const reqId = bytesToBigInt(reqIdBytes);
		
		// Convert raw headers to BlockHeader objects
		const headers = headersRaw.map((h: BlockHeaderBytes) => {
			const common = this.config.chainCommon;
			return createBlockHeaderFromBytesArray(h, { common });
		});

		this.config.logger?.info(
			`✅ Received BlockHeaders: reqId=${reqId}, count=${headers.length}`,
		);

		// Update best header if we got headers
		if (headers.length > 0) {
			const latestHeader = headers[headers.length - 1];
			if (!this.updatedBestHeader || latestHeader.number > this.updatedBestHeader.number) {
				this.updatedBestHeader = latestHeader;
			}
		}

		// Resolve pending request
		const pending = this.pendingRequests.get(reqId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve([reqId, headers]);
			this.pendingRequests.delete(reqId);
		}
	}

	private handleNewBlockMessage(decoded: any) {
		try {
			const [blockRaw, tdBytes] = decoded as [BlockBytes, Uint8Array];
			const td = bytesToBigInt(tdBytes);
			
			// Parse block
			const block = createBlockFromBytesArray(blockRaw, {
				common: this.config.chainCommon,
			});
			
			this.config.logger?.info(
				`📦 Received NewBlock: height=${block.header.number}, hash=${Buffer.from(block.hash()).toString('hex').slice(0, 16)}..., td=${td}`,
			);
			
			// Update best header
			if (!this.updatedBestHeader || block.header.number > this.updatedBestHeader.number) {
				this.updatedBestHeader = block.header;
			}
			
			// Emit PROTOCOL_MESSAGE event for FullSynchronizer
			if (this.peer) {
				this.config.events.emit(
					Event.PROTOCOL_MESSAGE,
					{ name: 'NewBlock', data: [block, td] },
					'eth',
					this.peer,
				);
			} else {
				this.config.logger?.warn(
					`Cannot emit PROTOCOL_MESSAGE - peer reference not set`,
				);
			}
		} catch (err: any) {
			this.config.logger?.error(
				`Error handling NewBlock: ${err.message}`,
			);
		}
	}

	private handleBlockBodiesMessage(decoded: any) {
		const [reqIdBytes, bodies] = decoded as [Uint8Array, BlockBodyBytes[]];
		const reqId = bytesToBigInt(reqIdBytes);

		this.config.logger?.info(
			`✅ Received BlockBodies: reqId=${reqId}, count=${bodies.length}`,
		);

		// Resolve pending request
		const pending = this.pendingRequests.get(reqId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve([reqId, bodies]);
			this.pendingRequests.delete(reqId);
		}
	}

	private handlePooledTransactionsMessage(decoded: any) {
		const [reqIdBytes, txs] = decoded as [Uint8Array, any[]];
		const reqId = bytesToBigInt(reqIdBytes);

		// Resolve pending request
		const pending = this.pendingRequests.get(reqId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve([reqId, txs]);
			this.pendingRequests.delete(reqId);
		}
	}

	private handleReceiptsMessage(decoded: any) {
		const [reqIdBytes, receipts] = decoded as [Uint8Array, any[]];
		const reqId = bytesToBigInt(reqIdBytes);

		// Resolve pending request
		const pending = this.pendingRequests.get(reqId);
		if (pending) {
			clearTimeout(pending.timeout);
			pending.resolve([reqId, receipts]);
			this.pendingRequests.delete(reqId);
		}
	}

	/**
	 * Get block headers from peer (using persistent stream)
	 */
	async getBlockHeaders(opts: {
		block: bigint | Uint8Array;
		max: number;
		skip?: number;
		reverse?: boolean;
	}): Promise<[bigint, BlockHeader[]] | undefined> {
		try {
			const reqId = ++this.requestId;

			this.config.logger?.debug(
				`📤 GetBlockHeaders request (reqId=${reqId}, block=${typeof opts.block === 'bigint' ? opts.block : '0x...'}, max=${opts.max})`,
			);

			// Create promise for response
			const responsePromise = new Promise<[bigint, BlockHeader[]]>((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingRequests.delete(reqId);
					this.config.logger?.warn(`GetBlockHeaders timeout for reqId=${reqId}`);
					resolve([reqId, []]);  // Timeout returns empty
				}, 10000);

				this.pendingRequests.set(reqId, {
					resolve,
					reject,
					timeout
				});
			});

			// Encode GetBlockHeaders request (code 0x03)
			const requestPayload = [
				bigIntToUnpaddedBytes(reqId),
				[
					typeof opts.block === 'bigint' ? bigIntToUnpaddedBytes(opts.block) : opts.block,
					bigIntToUnpaddedBytes(BigInt(opts.max)),
					bigIntToUnpaddedBytes(BigInt(opts.skip || 0)),
					bigIntToUnpaddedBytes(opts.reverse ? 1n : 0n),
				],
			];

			const encoded = RLP.encode(requestPayload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = 0x03; // GetBlockHeaders
			message.set(encoded, 1);

			// Send on PERSISTENT stream (don't open new one!)
			this.ethStream.send(message);

			// Wait for response (will be handled by handleBlockHeadersMessage)
			return await responsePromise;
		} catch (err: any) {
			this.config.logger?.error(
				`Failed to get block headers: ${err.message}`,
			);
			return undefined;
		}
	}


	/**
	 * Get block bodies from peer (using persistent stream)
	 */
	async getBlockBodies(opts: {
		hashes: Uint8Array[];
	}): Promise<[bigint, BlockBodyBytes[]] | undefined> {
		try {
			const reqId = ++this.requestId;

			this.config.logger?.debug(
				`📤 GetBlockBodies request (reqId=${reqId}, hashes=${opts.hashes.length})`,
			);

			// Create promise for response
			const responsePromise = new Promise<[bigint, BlockBodyBytes[]]>((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingRequests.delete(reqId);
					this.config.logger?.warn(`GetBlockBodies timeout for reqId=${reqId}`);
					resolve([reqId, []]);  // Timeout returns empty
				}, 10000);

				this.pendingRequests.set(reqId, {
					resolve,
					reject,
					timeout
				});
			});

			// Encode GetBlockBodies request (code 0x05)
			const requestPayload = [bigIntToUnpaddedBytes(reqId), opts.hashes];

			const encoded = RLP.encode(requestPayload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = 0x05; // GetBlockBodies
			message.set(encoded, 1);

			// Send on PERSISTENT stream (don't open new one!)
			this.ethStream.send(message);

			// Wait for response (will be handled by handleBlockBodiesMessage)
			return await responsePromise;
		} catch (err: any) {
			this.config.logger?.error(
				`Failed to get block bodies: ${err.message}`,
			);
			return undefined;
		}
	}

	/**
	 * Get pooled transactions from peer (using persistent stream)
	 */
	async getPooledTransactions(opts: {
		hashes: Uint8Array[];
	}): Promise<[bigint, TypedTransaction[]] | undefined> {
		try {
			const reqId = ++this.requestId;

			this.config.logger?.debug(
				`📤 GetPooledTransactions request (reqId=${reqId}, hashes=${opts.hashes.length})`,
			);

			// Create promise for response
			const responsePromise = new Promise<[bigint, TypedTransaction[]]>((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingRequests.delete(reqId);
					resolve([reqId, []]);
				}, 10000);

				this.pendingRequests.set(reqId, {
					resolve,
					reject,
					timeout
				});
			});

			// Encode request (code 0x09)
			const requestPayload = [bigIntToUnpaddedBytes(reqId), opts.hashes];
			const encoded = RLP.encode(requestPayload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = 0x09; // GetPooledTransactions
			message.set(encoded, 1);

			// Send on persistent stream
			this.ethStream.send(message);

			return await responsePromise;
		} catch (err: any) {
			this.config.logger?.error(
				`Failed to get pooled transactions: ${err.message}`,
			);
			return undefined;
		}
	}

	/**
	 * Get receipts from peer (using persistent stream)
	 */
	async getReceipts(opts: {
		hashes: Uint8Array[];
	}): Promise<[bigint, TxReceipt[]] | undefined> {
		try {
			const reqId = ++this.requestId;

			this.config.logger?.debug(
				`📤 GetReceipts request (reqId=${reqId}, hashes=${opts.hashes.length})`,
			);

			// Create promise for response
			const responsePromise = new Promise<[bigint, TxReceipt[]]>((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingRequests.delete(reqId);
					resolve([reqId, []]);
				}, 10000);

				this.pendingRequests.set(reqId, {
					resolve,
					reject,
					timeout
				});
			});

			// Encode request (code 0x0f)
			const requestPayload = [bigIntToUnpaddedBytes(reqId), opts.hashes];
			const encoded = RLP.encode(requestPayload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = 0x0f; // GetReceipts
			message.set(encoded, 1);

			// Send on persistent stream
			this.ethStream.send(message);

			return await responsePromise;
		} catch (err: any) {
			this.config.logger?.error(
				`Failed to get receipts: ${err.message}`,
			);
			return undefined;
		}
	}

	/**
	 * Request method for messages that expect a response
	 * Used for: Transactions (after NewPooledTransactionHashes)
	 */
	async request(name: string, args?: any): Promise<any> {
		this.config.logger?.debug(
			`📤 Request: ${name}`,
		);

		// For now, just send the message (fire-and-forget)
		// Transactions message doesn't expect a response in eth protocol
		if (name === "Transactions") {
			this.send(name, args);
			return Promise.resolve();
		}

		// Other request types not implemented
		this.config.logger?.warn(
			`Request type "${name}" not fully implemented`,
		);
		return undefined;
	}

	/**
	 * Send a message to peer (for announcements like NewBlock, Transactions, etc.)
	 * @param name Message name (NewBlock, NewBlockHashes, Transactions, etc.)
	 * @param args Message arguments
	 */
	send(name: string, args?: any): void {
		this.config.logger?.info(
			`📢 Sending ${name} to peer ${this.peerId.slice(0, 8)}...`,
		);

		try {
			// Map message names to codes
			const messageMap: Record<string, number> = {
				NewBlockHashes: 0x01,
				Transactions: 0x02,        // Full transaction data
				NewBlock: 0x07,
				NewPooledTransactionHashes: 0x08,
			};

			const code = messageMap[name];
			if (code === undefined) {
				this.config.logger?.warn(
					`Unknown message type: ${name}`,
				);
				return;
			}

			// Encode message based on type
			let payload: any;
			if (name === "NewBlock") {
				const [block, td] = args as [Block, bigint];
				payload = [block.raw(), bigIntToUnpaddedBytes(td)];
			} else if (name === "Transactions") {
				// args is array of TypedTransaction objects
				// Need to serialize each transaction
				payload = args.map((tx: any) => tx.serialize());
			} else {
				payload = args;
			}

			// Send the message on PERSISTENT stream
			const encoded = RLP.encode(payload);
			const message = new Uint8Array(1 + encoded.length);
			message[0] = code;
			message.set(encoded, 1);
			this.ethStream.send(message);

			this.config.logger?.info(
				`✅ Sent ${name} on persistent stream (${message.length} bytes)`,
			);
		} catch (err: any) {
			this.config.logger?.error(
				`Error sending ${name}: ${err.message}`,
			);
		}
	}
}

