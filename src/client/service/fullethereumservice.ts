import type { Block } from "../../block";
import { SyncMode } from "../config.ts";
import { VMExecution } from "../execution";
import { Miner } from "../miner";
import type { Peer } from "../net/peer/peer.ts";
// import type { Protocol } from "../net/protocol";
// import { EthProtocol } from "../net/protocol/ethprotocol.ts";
// import { StreamEthProtocol } from "../net/protocol/streamethprotocol.ts";
// import { P2PServer } from "../net/server/p2pserver.ts"; // Removed - using RLPx only
import { FullSynchronizer } from "../sync";
import { TxFetcher } from "../sync/fetcher/txFetcher.ts";
import { Event } from "../types.ts";
import type { ServiceOptions } from "./service.ts";
import { Service } from "./service.ts";
import { TxPool } from "./txpool.ts";

/**
 * Full Ethereum service
 * @memberof module:service
 */
export class FullEthereumService extends Service {
	/* synchronizer for syncing the chain */
	public declare synchronizer?: FullSynchronizer;
	public miner: Miner | undefined;
	public txPool: TxPool;

	public execution: VMExecution;

	/** building head state via vmexecution */
	private building = false;

	public txFetcher: TxFetcher;

	/**
	 * Create new ETH service
	 */
	constructor(options: ServiceOptions) {
		super(options);

		this.config.logger?.info("Full sync mode");

		const { metaDB } = options;
		this.execution = new VMExecution({
			config: options.config,
			stateDB: options.stateDB,
			metaDB,
			chain: this.chain,
		});

		this.txPool = new TxPool({
			config: this.config,
			service: this,
		});

		if (this.config.syncmode === SyncMode.Full) {
			// PoW-only mode - use full synchronizer
			this.synchronizer = new FullSynchronizer({
				config: this.config,
				pool: this.pool,
				chain: this.chain,
				txPool: this.txPool,
				execution: this.execution,
				interval: this.interval,
			});

			if (this.config.mine) {
				this.miner = new Miner({
					config: this.config,
					service: this,
				});
			}
		}

		this.txFetcher = new TxFetcher({
			config: this.config,
			pool: this.pool,
			txPool: this.txPool,
		});
	}

	override async open() {
		if (this.synchronizer !== undefined) {
			this.config.logger?.info(
				"Preparing for sync using FullEthereumService with FullSynchronizer.",
			);
		} else {
			this.config.logger?.info("Starting FullEthereumService with no syncing.");
		}

		// Setup event listeners for RlpxConnection-based protocol handlers
		this.setupRlpxEventListeners();

		// Broadcast pending txs to newly connected peer
		this.config.events.on(Event.POOL_PEER_ADDED, (peer) => {
			// TODO: Should we do this if the txPool isn't started?
			const txs: [number[], number[], Uint8Array[]] = [[], [], []];
			// Iterate over pending pool (executable txs)
			for (const [_addr, txObjs] of this.txPool.pending) {
				for (const txObj of txObjs) {
					const rawTx = txObj.tx;
					txs[0].push(rawTx.type);
					txs[1].push(rawTx.serialize().byteLength);
					txs[2].push(new Uint8Array(Buffer.from(txObj.hash, "hex")));
				}
			}
			// Also include queued pool txs
			for (const [_addr, txObjs] of this.txPool.queued) {
				for (const txObj of txObjs) {
					const rawTx = txObj.tx;
					txs[0].push(rawTx.type);
					txs[1].push(rawTx.serialize().byteLength);
					txs[2].push(new Uint8Array(Buffer.from(txObj.hash, "hex")));
				}
			}
			if (txs[0].length > 0) this.txPool.sendNewTxHashes(txs, [peer]);
		});

		this.config.events.on(
			Event.SYNC_FETCHED_BLOCKS,
			async (blocks: Block[]) => {
				// Remove mined txs
				this.txPool.removeNewBlockTxs(blocks);

				// Clear nonce cache for affected addresses
				for (const block of blocks) {
					for (const tx of block.transactions) {
						const addr = tx.getSenderAddress().toString().slice(2);
						this.txPool.clearNonceCache(addr);
					}
				}

				// Re-evaluate pool state
				await this.txPool.demoteUnexecutables();
				await this.txPool.promoteExecutables();
			},
		);

		this.config.events.on(Event.CHAIN_REORG, async (oldBlocks, newBlocks) => {
			await this.txPool.handleReorg(oldBlocks, newBlocks);
		});

		await super.open();

		await this.execution.open();

		this.txPool.open();
		if (this.config.mine) {
			// Start the TxPool immediately if mining
			this.txPool.start();
		}
		return true;
	}

	/**
	 * Start service
	 */
	override async start(): Promise<boolean> {
		if (this.running) {
			return false;
		}
		await super.start();
		this.miner?.start();
		await this.execution.start();
		void this.buildHeadState();
		this.txFetcher.start();
		return true;
	}

	/**
	 * if the vm head is not recent enough, trigger building a recent state by running
	 * vm execution
	 */
	async buildHeadState(): Promise<void> {
		if (this.building) return;
		this.building = true;

		try {
			if (this.execution.started && this.synchronizer !== undefined) {
				await this.synchronizer.runExecution();
			} else {
				this.config.logger?.warn(
					"skipping building head state as execution is not started",
				);
			}
		} catch (error) {
			this.config.logger?.error(`Error building headstate error=${error}`);
		} finally {
			this.building = false;
		}
	}

	/**
	 * Stop service
	 */
	override async stop(): Promise<boolean> {
		if (!this.running) {
			return false;
		}
		this.txPool.stop();
		this.miner?.stop();
		await this.synchronizer?.stop();

		// independently close execution
		await this.execution.stop();

		await super.stop();
		this.txFetcher.stop();
		return true;
	}

	/**
	 * Close service
	 */
	override async close() {
		if (!this.opened) return;
		this.txPool.close();
		await super.close();
	}


	/**
	 * Handles incoming message from connected peer
	 * @param message message object
	 * @param protocol protocol name
	 * @param peer peer
	 */
	override async handle(
		message: any,
		protocol: string,
		peer: Peer,
	): Promise<any> {
		if (protocol === "eth") {
			return this.handleEth(message, peer);
		}
	}

	/**
	 * Handles incoming ETH message from connected peer
	 * 
	 * NOTE: Most request/response handling is now done directly by protocol handlers.
	 * REQUEST messages (GetBlockHeaders, GetBlockBodies, GetReceipts, GetPooledTransactions)
	 * are handled by handler.responder() methods which automatically send responses via peer.eth.send().
	 * 
	 * ANNOUNCEMENT messages (Transactions, NewBlock, NewBlockHashes, NewPooledTransactionHashes)
	 * are handled by handler.handle() methods which process the announcements.
	 * 
	 * This method is kept for backwards compatibility but should rarely be called now.
	 * @param message message object
	 * @param peer peer
	 */
	async handleEth(message: any, peer: Peer): Promise<void> {
		// All message handling is now done by protocol handlers
		// This method is essentially a no-op but kept for compatibility
	}

	// ========== NEW RLPX CONNECTION HANDLERS ==========

	/**
	 * Called when STATUS message received via RlpxConnection
	 */
	async handleStatus(status: any, peer: Peer): Promise<void> {
		this.config.logger?.debug('[ETH] Handling STATUS from peer');
		// Store peer status, validate chain compatibility
		// This is handled by the legacy protocol system for now
	}

	/**
	 * Called when peer announces new block hashes via RlpxConnection
	 */
	async handleNewBlockHashes(hashes: any[], peer: Peer): Promise<void> {
		this.config.logger?.debug('[ETH] Received %d new block hashes', hashes.length);
		// Trigger synchronizer to fetch these blocks
		// Note: This would need to be integrated with the synchronizer's fetching mechanism
		// For now, we just log the announcement
	}

	/**
	 * Called when peer announces new full block via RlpxConnection
	 */
	async handleNewBlock(block: any, peer: Peer): Promise<void> {
		this.config.logger?.debug('[ETH] Received new block');
		// Validate and add to chain
		try {
			await this.chain.putBlocks([block]);
		} catch (error: any) {
			this.config.logger?.error(`[ETH] Failed to put block: ${error.message}`);
		}
	}

	/**
	 * Called when peer requests headers via RlpxConnection
	 */
	async handleGetBlockHeaders(request: any, peer: Peer): Promise<void> {
		this.config.logger?.debug('[ETH] Peer requested block headers');

		try {
			// Fetch headers from chain
			// Note: This is a simplified implementation, you may need to adjust based on your chain API
			const headers = []; // await this.chain.getHeaders(request);

			// Send response via peer's ETH protocol
			const ethHandler = this.getEthHandler(peer);
			if (ethHandler) {
				await ethHandler.sendBlockHeaders(headers);
			}
		} catch (error: any) {
			this.config.logger?.error(`[ETH] Failed to handle getBlockHeaders: ${error.message}`);
		}
	}

	/**
	 * Called when peer requests bodies via RlpxConnection
	 */
	async handleGetBlockBodies(request: any, peer: Peer): Promise<void> {
		this.config.logger?.debug('[ETH] Peer requested block bodies');

		try {
			// Fetch bodies from chain
			// Note: This is a simplified implementation, you may need to adjust based on your chain API
			const bodies = []; // await this.chain.getBodies(request);

			// Send response via peer's ETH protocol
			const ethHandler = this.getEthHandler(peer);
			if (ethHandler) {
				await ethHandler.sendBlockBodies(bodies);
			}
		} catch (error: any) {
			this.config.logger?.error(`[ETH] Failed to handle getBlockBodies: ${error.message}`);
		}
	}

	/**
	 * Helper to get ETH protocol handler from peer's RlpxConnection
	 */
	private getEthHandler(peer: Peer): any | null {
		if (!peer.rlpxConnection) {
			this.config.logger?.warn('[ETH] Peer has no RlpxConnection');
			return null;
		}

		const protocols = (peer.rlpxConnection as any).protocols as Map<string, any>;
		const ethDescriptor = protocols.get('eth');
		if (!ethDescriptor) {
			this.config.logger?.warn('[ETH] Peer does not support ETH protocol');
			return null;
		}

		return ethDescriptor.handler;
	}

	/**
	 * Setup event listeners for RlpxConnection-based protocol handlers
	 */
	private setupRlpxEventListeners(): void {
		// Listen for ETH protocol messages from RlpxConnection
		this.config.events.on(Event.ETH_STATUS, async (status, peer) => {
			await this.handleStatus(status, peer);
		});

		this.config.events.on(Event.ETH_NEW_BLOCK_HASHES, async (hashes, peer) => {
			await this.handleNewBlockHashes(hashes, peer);
		});

		this.config.events.on(Event.ETH_NEW_BLOCK, async (block, peer) => {
			await this.handleNewBlock(block, peer);
		});

		this.config.events.on(Event.ETH_GET_BLOCK_HEADERS, async (request, peer) => {
			await this.handleGetBlockHeaders(request, peer);
		});

		this.config.events.on(Event.ETH_GET_BLOCK_BODIES, async (request, peer) => {
			await this.handleGetBlockBodies(request, peer);
		});

		this.config.events.on(Event.ETH_TRANSACTIONS, async (txs, peer) => {
			// Forward to TxPool
			await this.txPool.handleIncomingTransactions(txs, peer);
		});

		this.config.events.on(Event.ETH_POOLED_TRANSACTIONS, async (txs, peer) => {
			// Forward to TxPool
			await this.txPool.handleIncomingTransactions(txs, peer);
		});

		this.config.events.on(Event.ETH_GET_POOLED_TRANSACTIONS, async (request, peer) => {
			// Handle request for pooled transactions
			const hashes = request.hashes || [];
			const txs = this.txPool.getByHash(hashes);

			const ethHandler = this.getEthHandler(peer);
			if (ethHandler && txs.length > 0) {
				await ethHandler.sendPooledTransactions(txs.map((tx) => tx.serialize()));
			}
		});
	}

	/**
	 * Setup chain event listeners for broadcasting
	 */
	setupChainEventListeners(): void {
		// Listen for new blocks (SYNC_FETCHED_BLOCKS is the actual event for new blocks)
		this.config.events.on(Event.SYNC_FETCHED_BLOCKS, async (blocks) => {
			if (blocks.length > 0) {
				const latestBlock = blocks[blocks.length - 1];
				this.config.logger?.info('[ETH] New block fetched, broadcasting to peers');
				await this.broadcastNewBlock(latestBlock);
			}
		});

		// Note: Transaction broadcasting is handled directly by TxPool
		// which calls peer.eth.send() for legacy protocol or broadcasts via RlpxConnection
	}

	/**
	 * Broadcast new block to all peers via RlpxConnection
	 */
	async broadcastNewBlock(block: any): Promise<void> {
		const peers = this.pool.peers;
		const blockHash = block.hash();
		const blockNumber = block.header.number;

		for (const peer of peers) {
			try {
				const ethHandler = this.getEthHandler(peer);
				if (ethHandler) {
					// Send NEW_BLOCK_HASHES announcement
					await ethHandler.announceBlockHashes([
						{ hash: blockHash, number: blockNumber },
					]);

					this.config.logger?.debug(
						`[ETH] Announced block ${blockNumber} to peer ${peer.id.slice(0, 8)}`,
					);
				}
			} catch (err: any) {
				this.config.logger?.error(
					`[ETH] Failed to announce block to peer ${peer.id.slice(0, 8)}: ${err.message}`,
				);
			}
		}
	}

	/**
	 * Broadcast transaction to all peers via RlpxConnection
	 */
	async broadcastTransaction(tx: any): Promise<void> {
		const peers = this.pool.peers;

		for (const peer of peers) {
			try {
				const ethHandler = this.getEthHandler(peer);
				if (ethHandler) {
					await ethHandler.broadcastTransactions([tx.serialize()]);

					this.config.logger?.debug(
						`[ETH] Broadcast transaction to peer ${peer.id.slice(0, 8)}`,
					);
				}
			} catch (err: any) {
				this.config.logger?.error(
					`[ETH] Failed to broadcast tx to peer ${peer.id.slice(0, 8)}: ${err.message}`,
				);
			}
		}
	}
}
