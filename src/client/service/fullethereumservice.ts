import type { Block } from "../../block";
import { concatBytes } from "../../utils";
import { encodeReceipt } from "../../vm";
import { SyncMode } from "../config.ts";
import { VMExecution } from "../execution";
import { Miner } from "../miner";
import type { Peer } from "../net/peer/peer.ts";
import type { Protocol } from "../net/protocol";
import { EthProtocol } from "../net/protocol/ethprotocol.ts";
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
		const protocols: Protocol[] = [
			new EthProtocol({
				config: this.config,
				chain: this.chain,
				timeout: this.timeout,
			}),
		];
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
	 * @param message message object
	 * @param peer peer
	 */
	async handleEth(message: any, peer: Peer): Promise<void> {
		switch (message.name) {
			case "GetBlockHeaders": {
				const { reqId, block, max, skip, reverse } = message.data;
				if (typeof block === "bigint") {
					if (
						(reverse === true && block > this.chain.headers.height) ||
						(reverse !== true &&
							block + BigInt(max * skip) > this.chain.headers.height)
					) {
						// Respond with an empty list in case the header is higher than the current height
						// This is to ensure Geth does not disconnect with "useless peer"
						// TODO: in batch queries filter out the headers we do not have and do not send
						// the empty list in case one or more headers are not available
						peer.eth!.send("BlockHeaders", { reqId, headers: [] });
						return;
					}
				}
				const headers = await this.chain.getHeaders(block, max, skip, reverse);
				peer.eth!.send("BlockHeaders", { reqId, headers });
				break;
			}

			case "GetBlockBodies": {
				const { reqId, hashes } = message.data;
				const blocks: Block[] = await Promise.all(
					hashes.map((hash: Uint8Array) => this.chain.getBlock(hash)),
				);
				const bodies = blocks.map((block) => block.raw().slice(1));
				peer.eth!.send("BlockBodies", { reqId, bodies });
				break;
			}
			case "NewBlockHashes": {
				console.log(message);

				if (this.synchronizer instanceof FullSynchronizer) {
					this.synchronizer.handleNewBlockHashes(message.data);
				}
				break;
			}
			case "Transactions": {
				await this.txPool.handleAnnouncedTxs(message.data, peer, this.pool);
				break;
			}
			case "NewBlock": {
				if (this.synchronizer instanceof FullSynchronizer) {
					console.log(message);
					await this.synchronizer.handleNewBlock(message.data[0], peer);
				}
				break;
			}
			case "NewPooledTransactionHashes": {
				let hashes = [];
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
				const txs = this.txPool.getByHash(hashes);
				// Always respond, also on an empty list
				peer.eth?.send("PooledTransactions", { reqId, txs });
				break;
			}
			case "GetReceipts": {
				const [reqId, hashes] = message.data;
				const { receiptsManager } = this.execution;
				if (!receiptsManager) return;
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
						break;
					}
				}
				peer.eth?.send("Receipts", { reqId, receipts });
				break;
			}
		}
	}
}
