import debug from "debug";
import type { Block } from "../../block";
import { concatBytes } from "../../utils";
import { encodeReceipt } from "../../vm";
import { SyncMode } from "../config.ts";
import { Miner } from "../miner";
import type { Peer } from "../net/peer/peer.ts";
// EthProtocol removed - P2P uses EthHandler directly
import { FullSynchronizer } from "../sync";
import { TxFetcher } from "../sync/fetcher/txFetcher.ts";
import { Event } from "../types.ts";
import type { ServiceOptions } from "./service.ts";
import { Service } from "./service.ts";
import { TxPool } from "./txpool.ts";

const log = debug("p2p:full-ethereum-service");

/**
 * Full Ethereum service using P2P networking
 * Extends Service and implements all ETH protocol message handlers
 *
 * Extends Service and implements all ETH protocol message handlers
 *
 * @memberof module:service
 */
export class P2PFullEthereumService extends Service {
	/* synchronizer for syncing the chain */
	public declare synchronizer?: FullSynchronizer;
	public miner: Miner | undefined;
	public txPool: TxPool;

	/** building head state via vmexecution */
	private building = false;

	public txFetcher: TxFetcher;

	/**
	 * Create new P2P ETH service
	 */
	constructor(options: ServiceOptions) {
		log("Creating P2PFullEthereumService");
		super(options);

		this.config.logger?.info("Full sync mode (P2P)");
		log("Full sync mode (P2P)");

		// Set execution in peer pool so peers can create EthHandler instances
		log("Setting execution in P2PPeerPool");
		this.pool.setExecution(this.execution);

		log("Creating TxPool");
		this.txPool = new TxPool({
			config: this.config,
			service: this,
		});

		if (this.config.syncmode === SyncMode.Full) {
			log("Creating FullSynchronizer");
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
				log("Creating Miner");
				this.miner = new Miner({
					config: this.config,
					service: this,
				});
			}
		}

		log("Creating TxFetcher");
		this.txFetcher = new TxFetcher({
			config: this.config,
			pool: this.pool,
			txPool: this.txPool,
		});
	}

	override async open() {
		log("Opening P2PFullEthereumService");
		if (this.synchronizer !== undefined) {
			log(
				"Preparing for sync using P2PFullEthereumService with FullSynchronizer",
			);
			this.config.logger?.info(
				"Preparing for sync using P2PFullEthereumService with FullSynchronizer.",
			);
		} else {
			log("Starting P2PFullEthereumService with no syncing");
			this.config.logger?.info(
				"Starting P2PFullEthereumService with no syncing.",
			);
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

		log("Opening execution");
		await this.execution.open();

		log("Opening txPool");
		this.txPool.open();
		if (this.config.mine) {
			log("Starting txPool (mining enabled)");
			// Start the TxPool immediately if mining
			this.txPool.start();
		}
		log("P2PFullEthereumService opened");
		return true;
	}

	/**
	 * Start service
	 */
	override async start(): Promise<boolean> {
		if (this.running) {
			log("Service already running");
			return false;
		}
		log("Starting P2PFullEthereumService");
		await super.start();
		if (this.miner) {
			log("Starting miner");
			this.miner.start();
		}
		log("Starting execution");
		await this.execution.start();
		log("Building head state");
		void this.buildHeadState();
		log("Starting txFetcher");
		this.txFetcher.start();
		log("P2PFullEthereumService started");
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
			log("Service not running");
			return false;
		}
		log("Stopping P2PFullEthereumService");
		this.txPool.stop();
		if (this.miner) {
			log("Stopping miner");
			this.miner.stop();
		}
		await this.synchronizer?.stop();

		// independently close execution
		log("Stopping execution");
		await this.execution.stop();

		await super.stop();
		log("Stopping txFetcher");
		this.txFetcher.stop();
		log("P2PFullEthereumService stopped");
		return true;
	}

	/**
	 * Close service
	 */
	override async close(): Promise<boolean> {
		if (!this.opened) {
			log("Service not opened");
			return false;
		}
		log("Closing P2PFullEthereumService");
		this.txPool.close();
		const result = await super.close();
		log("P2PFullEthereumService closed");
		return result;
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
	 * @param message message object
	 * @param peer peer
	 */
	async handleEth(message: any, peer: Peer): Promise<void> {
		log(
			"Handling ETH message: %s from peer %s",
			message.name,
			peer.id.slice(0, 8),
		);
		switch (message.name) {
			case "GetBlockHeaders": {
				const { reqId, block, max, skip, reverse } = message.data;
				log(
					"GetBlockHeaders: reqId=%d, block=%s, max=%d",
					reqId,
					typeof block === "bigint" ? block.toString() : "hash",
					max,
				);
				if (typeof block === "bigint") {
					if (
						(reverse === true && block > this.chain.headers.height) ||
						(reverse !== true &&
							block + BigInt(max * skip) > this.chain.headers.height)
					) {
						log("Block range exceeds chain height, sending empty headers");
						// Respond with an empty list in case the header is higher than the current height
						// This is to ensure Geth does not disconnect with "useless peer"
						// TODO: in batch queries filter out the headers we do not have and do not send
						// the empty list in case one or more headers are not available
						peer.eth!.send("BlockHeaders", { reqId, headers: [] });
						return;
					}
				}
				const headers = await this.chain.getHeaders(block, max, skip, reverse);
				log("Sending %d headers in response", headers.length);
				peer.eth!.send("BlockHeaders", { reqId, headers });
				break;
			}

			case "GetBlockBodies": {
				const { reqId, hashes } = message.data;
				log("GetBlockBodies: reqId=%d, hashes=%d", reqId, hashes.length);
				const blocks: Block[] = await Promise.all(
					hashes.map((hash: Uint8Array) => this.chain.getBlock(hash)),
				);
				const bodies = blocks.map((block) => block.raw().slice(1));
				peer.eth!.send("BlockBodies", { reqId, bodies });
				break;
			}
			case "NewBlockHashes": {
				log(
					"NewBlockHashes: %d hashes",
					Array.isArray(message.data) ? message.data.length : 0,
				);
				if (this.synchronizer instanceof FullSynchronizer) {
					this.synchronizer.handleNewBlockHashes(message.data);
				}
				break;
			}
			case "Transactions": {
				log(
					"Transactions: %d transactions",
					Array.isArray(message.data) ? message.data.length : 0,
				);
				await this.txPool.handleAnnouncedTxs(message.data, peer, this.pool);
				break;
			}
			case "NewBlock": {
				if (this.synchronizer instanceof FullSynchronizer) {
					const blockHeight = message.data[0]?.header?.number;
					log("NewBlock: height=%d", blockHeight);
					this.config.logger?.info(
						`📦 Handling NewBlock message: height=${blockHeight}, peer=${peer?.id?.slice(0, 8) || "null"}`,
					);
					await this.synchronizer.handleNewBlock(message.data[0], peer);
				}
				break;
			}
			case "NewPooledTransactionHashes": {
				let hashes = [];
				log(
					"NewPooledTransactionHashes: eth/%d",
					peer.eth!["versions"]?.[0] || "unknown",
				);
				if (peer.eth!["versions"].includes(68)) {
					// eth/68 message data format - [tx_types: number[], tx_sizes: number[], tx_hashes: uint8array[]]
					// With eth/68, we can check transaction types and transaction sizes to
					// decide whether or not to download the transactions announced by this message.  This
					// can be used to prevent mempool spamming or decide whether or not to filter out certain
					// transactions - though this is not prescribed in eth/68 (EIP 5793)
					// https://eips.ethereum.org/EIPS/eip-5793
					hashes = message.data[2] as Uint8Array[];
				} else {
					hashes = message.data;
				}
				await this.txPool.handleAnnouncedTxHashes(hashes, peer, this.pool);
				break;
			}
			case "GetPooledTransactions": {
				const { reqId, hashes } = message.data;
				log("GetPooledTransactions: reqId=%d, hashes=%d", reqId, hashes.length);
				const txs = this.txPool.getByHash(hashes);
				log("Sending %d pooled transactions in response", txs.length);
				// Always respond, also on an empty list
				peer.eth?.send("PooledTransactions", { reqId, txs });
				break;
			}
			case "GetReceipts": {
				const [reqId, hashes] = message.data;
				log("GetReceipts: reqId=%d, hashes=%d", reqId, hashes.length);
				const { receiptsManager } = this.execution;
				if (!receiptsManager) {
					log("ReceiptsManager not available");
					return;
				}
				const receipts = [];
				let receiptsSize = 0;
				for (const hash of hashes) {
					const blockReceipts = await receiptsManager.getReceipts(
						hash,
						true,
						true,
					);
					if (blockReceipts === undefined) continue;
					receipts.push(...blockReceipts);
					const receiptsBytes = concatBytes(
						...receipts.map((r) => encodeReceipt(r, r.txType)),
					);
					receiptsSize += receiptsBytes.byteLength;
					// From spec: The recommended soft limit for Receipts responses is 2 MiB.
					if (receiptsSize >= 2097152) {
						log("Receipts size limit reached (2 MiB), stopping");
						break;
					}
				}
				log("Sending %d receipts in response", receipts.length);
				peer.eth?.send("Receipts", { reqId, receipts });
				break;
			}
		}
	}

	override get protocols(): any[] {
		// For P2P, protocols are handled via EthHandler instances on peers
		// Return empty array as Protocol instances are not used in P2P mode
		return [];
	}
}
