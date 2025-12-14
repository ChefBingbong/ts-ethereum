import type { Block } from "../../block";
import { SyncMode } from "../config.ts";
import { VMExecution } from "../execution";
import { Miner } from "../miner";
import type { Peer } from "../net/peer/peer.ts";
import type { ProtocolOptions } from "../net/protocol/abstract-protocol.ts";
import { AbstractProtocol } from "../net/protocol/abstract-protocol.ts";
import { ETH_PROTOCOL_SPEC } from "../net/protocol/eth/definitions.ts";
import { EthProtocol } from "../net/protocol/eth/protocol.ts";
type Protocol = AbstractProtocol<ProtocolOptions>;
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
	 * Returns all protocols required by this service
	 */
	override get protocols(): Protocol[] {
		const protocols: Protocol[] = [];
		
		// Use StreamEthProtocol for P2PServer, EthProtocol for RlpxServer
		protocols.push(
			new EthProtocol({
				spec: ETH_PROTOCOL_SPEC,
				config: this.config,
				chain: this.chain,
				service: this, // Pass service reference for handler context
			}),
		);
		return protocols;
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
}
