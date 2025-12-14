import * as RLP from '../../../../rlp/index';
import { BaseProtocolHandler } from '../base-protocol-handler';
import {
	BlockBodiesHandler,
	BlockHeadersHandler,
	NewBlockHandler,
	NewBlockHashesHandler,
	PooledTransactionsHandler,
	StatusHandler,
	TransactionsHandler,
	type BlockHash,
	type GetBlockBodiesRequest,
	type GetBlockHeadersRequest,
	type GetPooledTransactionsRequest,
	type HandlerContext,
	type NewBlockPayload,
	type StatusPayload,
} from './handlers';

// ETH protocol message codes (relative to protocol offset)
export const ETH_CODES = {
	STATUS: 0x00,
	NEW_BLOCK_HASHES: 0x01,
	TRANSACTIONS: 0x02,
	GET_BLOCK_HEADERS: 0x03,
	BLOCK_HEADERS: 0x04,
	GET_BLOCK_BODIES: 0x05,
	BLOCK_BODIES: 0x06,
	NEW_BLOCK: 0x07,
	NEW_POOLED_TRANSACTION_HASHES: 0x08,
	GET_POOLED_TRANSACTIONS: 0x09,
	POOLED_TRANSACTIONS: 0x0a,
};

export class EthProtocolHandler extends BaseProtocolHandler {
	// Dedicated handlers for each message type
	public statusHandler: StatusHandler;
	public blockHeadersHandler: BlockHeadersHandler;
	public blockBodiesHandler: BlockBodiesHandler;
	public newBlockHashesHandler: NewBlockHashesHandler;
	public transactionsHandler: TransactionsHandler;
	public newBlockHandler: NewBlockHandler;
	public pooledTransactionsHandler: PooledTransactionsHandler;

	// Store peer status for sync management
	public status?: StatusPayload;

	constructor(version: number = 68) {
		super('eth', version, 16); // Reserve 16 codes

		// Create handler instances
		this.statusHandler = new StatusHandler();
		this.blockHeadersHandler = new BlockHeadersHandler();
		this.blockBodiesHandler = new BlockBodiesHandler();
		this.newBlockHashesHandler = new NewBlockHashesHandler();
		this.transactionsHandler = new TransactionsHandler();
		this.newBlockHandler = new NewBlockHandler();
		this.pooledTransactionsHandler = new PooledTransactionsHandler();

		// Register handlers
		this.setupHandlers();
	}

	private setupHandlers(): void {
		// STATUS
		this.on(this.statusHandler.code, async (data, conn) => {
			const status = await this.statusHandler.handle(data, this.createContext());
			// Store status for sync management
			this.status = status;
			// Emit event for service to handle
			conn.dispatchEvent(new CustomEvent('eth:status', { detail: status }));
		});

		// NEW_BLOCK_HASHES
		this.on(this.newBlockHashesHandler.code, async (data, conn) => {
			const hashes = await this.newBlockHashesHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:newBlockHashes', { detail: hashes }));
		});

		// TRANSACTIONS
		this.on(this.transactionsHandler.code, async (data, conn) => {
			const txs = await this.transactionsHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:transactions', { detail: txs }));
		});

		// GET_BLOCK_HEADERS
		this.on(this.blockHeadersHandler.code, async (data, conn) => {
			const request = await this.blockHeadersHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:getBlockHeaders', { detail: request }));
		});

		// BLOCK_HEADERS (response)
		this.on(this.blockHeadersHandler.responseCode, async (data, conn) => {
			// eth/66 format: [reqId, headers]
			const decoded = RLP.decode(data) as any[];
			const reqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
			const headers = decoded[1] || [];
			conn.dispatchEvent(new CustomEvent('eth:blockHeaders', { detail: [reqId, headers] }));
		});

		// GET_BLOCK_BODIES
		this.on(this.blockBodiesHandler.code, async (data, conn) => {
			const request = await this.blockBodiesHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:getBlockBodies', { detail: request }));
		});

		// BLOCK_BODIES (response)
		this.on(this.blockBodiesHandler.responseCode, async (data, conn) => {
			// eth/66 format: [reqId, bodies]
			const decoded = RLP.decode(data) as any[];
			const reqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
			const bodies = decoded[1] || [];
			conn.dispatchEvent(new CustomEvent('eth:blockBodies', { detail: [reqId, bodies] }));
		});

		// NEW_BLOCK
		this.on(this.newBlockHandler.code, async (data, conn) => {
			const block = await this.newBlockHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:newBlock', { detail: block }));
		});

		// GET_POOLED_TRANSACTIONS
		this.on(this.pooledTransactionsHandler.code, async (data, conn) => {
			const request = await this.pooledTransactionsHandler.handle(data, this.createContext());
			conn.dispatchEvent(new CustomEvent('eth:getPooledTransactions', { detail: request }));
		});

		// POOLED_TRANSACTIONS (response)
		this.on(this.pooledTransactionsHandler.responseCode, async (data, conn) => {
			// eth/66 format: [reqId, transactions]
			const decoded = RLP.decode(data) as any[];
			const reqId = typeof decoded[0] === 'bigint' ? decoded[0] : BigInt(decoded[0]);
			const txs = decoded[1] || [];
			conn.dispatchEvent(new CustomEvent('eth:pooledTransactions', { detail: [reqId, txs] }));
		});
	}

	private createContext(): HandlerContext {
		if (!this.connection) {
			throw new Error(`Cannot create handler context: ${this.name} protocol handler has no connection`);
		}
		return {
			connection: this.connection,
			socket: this.connection.socket,
			timeout: 8000,
		};
	}

	// ========== Convenience Methods Using Handlers ==========

	/**
	 * Send STATUS and wait for peer's STATUS response
	 */
	async sendStatus(payload: StatusPayload): Promise<StatusPayload> {
		const peerStatus = await this.statusHandler.sendGetStatus(payload, this.createContext());
		// Store the peer's status
		this.status = peerStatus;
		return peerStatus;
	}

	/**
	 * Request block headers and wait for response
	 * Returns [reqId, headers] tuple for eth/66 compatibility
	 */
	async getBlockHeaders(request: GetBlockHeadersRequest): Promise<[bigint, any[]]> {
		return this.blockHeadersHandler.sendGetHeaders(request, this.createContext());
	}

	/**
	 * Send block headers response
	 */
	async sendBlockHeaders(headers: any[], reqId?: bigint): Promise<void> {
		await this.blockHeadersHandler.sendHeaders(headers, this.createContext(), reqId);
	}

	/**
	 * Request block bodies and wait for response
	 * Returns [reqId, bodies] tuple for eth/66 compatibility
	 */
	async getBlockBodies(request: GetBlockBodiesRequest): Promise<[bigint, any[]]> {
		return this.blockBodiesHandler.sendGetBodies(request, this.createContext());
	}

	/**
	 * Send block bodies response
	 */
	async sendBlockBodies(bodies: any[], reqId?: bigint): Promise<void> {
		await this.blockBodiesHandler.sendBodies(bodies, this.createContext(), reqId);
	}

	/**
	 * Announce new block hashes
	 */
	async announceBlockHashes(hashes: BlockHash[]): Promise<void> {
		await this.newBlockHashesHandler.send(hashes, this.createContext());
	}

	/**
	 * Broadcast transactions
	 */
	async broadcastTransactions(txs: Uint8Array[]): Promise<void> {
		await this.transactionsHandler.send(txs, this.createContext());
	}

	/**
	 * Announce new block
	 */
	async announceNewBlock(payload: NewBlockPayload): Promise<void> {
		if (!this.connection) {
			throw new Error(`Cannot announce new block: ${this.name} protocol handler has no connection`);
		}
		await this.newBlockHandler.send(payload, this.createContext());
	}

	/**
	 * Request pooled transactions and wait for response
	 * Returns [reqId, transactions] tuple for eth/66 compatibility
	 */
	async getPooledTransactions(request: GetPooledTransactionsRequest): Promise<[bigint, Uint8Array[]]> {
		return this.pooledTransactionsHandler.sendGetPooledTransactions(request, this.createContext());
	}

	/**
	 * Send pooled transactions response
	 */
	async sendPooledTransactions(transactions: Uint8Array[], reqId?: bigint): Promise<void> {
		await this.pooledTransactionsHandler.sendTransactions(transactions, this.createContext(), reqId);
	}
}

