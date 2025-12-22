import type { Block } from "../../block";
import { Miner } from "../miner";
import type { Peer } from "../net/peer/peer.ts";
import {
	type EthHandlerContext,
	handleGetBlockBodies,
	handleGetBlockHeaders,
	handleGetPooledTransactions,
	handleGetReceipts,
	handleNewBlock,
	handleNewBlockHashes,
	handleNewPooledTransactionHashes,
	handleTransactions,
} from "../net/protocol/eth/handlers.ts";
import { FullSynchronizer } from "../sync";
import { TxFetcher } from "../sync/fetcher/txFetcher.ts";
import { Event } from "../types.ts";
import { getV8Engine } from "../util/index.ts";
import { ServiceOptions } from "./fullethereumservice-types.ts";
import { Service, STATS_INTERVAL } from "./service.ts";
import { TxPool } from "./txpool.ts";

export type ProtocolMessage = {
	message: { name: string; data: unknown };
	protocol: string;
	peer: Peer;
};

export class P2PFullEthereumService extends Service {
	public miner?: Miner;
	public txPool: TxPool;
	public txFetcher: TxFetcher;

	private building = false;

	constructor(options: ServiceOptions) {
		super(options);
		this.pool.setExecution(this.execution);

		this.txPool = new TxPool({
			config: this.config,
			pool: this.pool,
			chain: this.chain,
			execution: this.execution,
		});

		this.synchronizer = new FullSynchronizer({
			config: this.config,
			pool: this.pool,
			chain: this.chain,
			txPool: this.txPool,
			execution: this.execution,
			interval: this.interval,
		});

		this.miner = new Miner({
			config: this.config,
			txPool: this.txPool,
			synchronizer: this.synchronizer,
			chain: this.chain,
			execution: this.execution,
		});

		this.txFetcher = new TxFetcher({
			config: this.config,
			pool: this.pool,
			txPool: this.txPool,
		});
	}

	async open() {
		try {
			this.setupBasicEventListeners();
			if (this.opened) return false;

			await this.pool.open();
			await this.chain.open();
			await this.synchronizer?.open();
			this.opened = true;

			await this.execution.open();
			this.txPool.open();
			this.txPool.start();
			return true;
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`Error opening: ${error.message}`);
			this.opened = false;
			return false;
		}
	}

	async start(): Promise<boolean> {
		if (this.running) return false;

		try {
			await this.pool.start();
			void this.synchronizer?.start();

			if (!this.v8Engine) {
				this.v8Engine = await getV8Engine();
			}

			this.statsInterval = setInterval(
				await this.stats.bind(this),
				STATS_INTERVAL,
			);

			this.running = true;
			this.miner.start();
			await this.execution.start();

			void this.buildHeadState();
			this.txFetcher.start();
			return true;
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
			this.running = false;
			return false;
		}
	}

	async stop(): Promise<boolean> {
		if (!this.running) return false;

		try {
			this.txPool.stop();
			this.miner.stop();

			await this.synchronizer?.stop();
			await this.execution.stop();

			if (!this.running) return false;
			if (this.opened) {
				await this.close();
				await this.synchronizer?.close();
			}

			await this.pool.stop();
			clearInterval(this.statsInterval);
			await this.synchronizer?.stop();

			this.running = false;
			this.txFetcher.stop();
			return true;
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
			this.running = false;
			return false;
		}
	}

	async close(): Promise<boolean> {
		if (!this.opened) return false;
		try {
			this.closeEventListeners();
			this.txPool.close();

			const result = !!this.opened;
			if (this.opened) {
				await this.pool.close();
				this.opened = false;
			}

			return result;
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
			this.opened = false;
			return false;
		}
	}

	async buildHeadState(): Promise<void> {
		try {
			if (this.building) return;
			this.building = true;

			if (!this.execution.started) return;
			await this.synchronizer.runExecution();
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
		} finally {
			this.building = false;
		}
	}

	override async handle(_message: ProtocolMessage): Promise<void> {
		if (_message.protocol !== "eth") return;
		const { message, peer } = _message;

		console.log("Handling message", _message);
		const context: EthHandlerContext = {
			chain: this.chain,
			txPool: this.txPool,
			synchronizer: this.synchronizer,
			execution: this.execution,
			pool: this.pool,
		};

		try {
			switch (message.name) {
				case "GetBlockHeaders":
					await handleGetBlockHeaders(
						message.data as Parameters<typeof handleGetBlockHeaders>[0],
						peer,
						context,
					);
					break;

				case "GetBlockBodies":
					await handleGetBlockBodies(
						message.data as Parameters<typeof handleGetBlockBodies>[0],
						peer,
						context,
					);
					break;

				case "NewBlockHashes":
					handleNewBlockHashes(
						message.data as Parameters<typeof handleNewBlockHashes>[0],
						context,
					);
					break;

				case "Transactions":
					await handleTransactions(
						message.data as Parameters<typeof handleTransactions>[0],
						peer,
						context,
					);
					break;

				case "NewBlock":
					await handleNewBlock(
						message.data as Parameters<typeof handleNewBlock>[0],
						peer,
						context,
					);
					break;

				case "NewPooledTransactionHashes":
					await handleNewPooledTransactionHashes(
						message.data as Parameters<
							typeof handleNewPooledTransactionHashes
						>[0],
						peer,
						context,
					);
					break;

				case "GetPooledTransactions":
					handleGetPooledTransactions(
						message.data as Parameters<typeof handleGetPooledTransactions>[0],
						peer,
						context,
					);
					break;

				case "GetReceipts":
					await handleGetReceipts(
						message.data as Parameters<typeof handleGetReceipts>[0],
						peer,
						context,
					);
					break;
			}
		} catch (error) {
			const err = error as Error;
			this.error(`${err.message}`);
			this.debug(`Error handling ${message.name}: ${err.message}`);
		}
	}

	private onProtocolMessage = async (message: ProtocolMessage) => {
		try {
			if (!this.running) return;
			await this.handle(message);
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`Error handling message: ${error.message}`);
		}
	};

	private onPoolPeerAdded = (peer: Peer) => {
		const txs: [number[], number[], Uint8Array[]] = [[], [], []];
		for (const [_addr, txObjs] of this.txPool.pending) {
			for (const txObj of txObjs) {
				const rawTx = txObj.tx;
				txs[0].push(rawTx.type);
				txs[1].push(rawTx.serialize().byteLength);
				txs[2].push(new Uint8Array(Buffer.from(txObj.hash, "hex")));
			}
		}
		for (const [_addr, txObjs] of this.txPool.queued) {
			for (const txObj of txObjs) {
				const rawTx = txObj.tx;
				txs[0].push(rawTx.type);
				txs[1].push(rawTx.serialize().byteLength);
				txs[2].push(new Uint8Array(Buffer.from(txObj.hash, "hex")));
			}
		}
		if (txs[0].length > 0) this.txPool.sendNewTxHashes(txs, [peer]);
	};

	private onSyncNewBlocks = async (blocks: Block[]) => {
		this.txPool.removeNewBlockTxs(blocks);

		for (const block of blocks) {
			for (const tx of block.transactions) {
				this.txPool.clearNonceCache(tx.getSenderAddress().toString().slice(2));
			}
		}
		try {
			await Promise.all([
				this.txPool.demoteUnexecutables(),
				this.txPool.promoteExecutables(),
			]);
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
		}
	};

	private onChainReorg = async (oldBlocks: Block[], newBlocks: Block[]) => {
		try {
			await this.txPool.handleReorg(oldBlocks, newBlocks);
		} catch (error) {
			this.error(`${error.message}`);
			this.debug(`${error.message}`);
		}
	};

	setupBasicEventListeners() {
		this.config.events.on(Event.PROTOCOL_MESSAGE, this.onProtocolMessage);
		this.config.events.on(Event.POOL_PEER_ADDED, this.onPoolPeerAdded);
		this.config.events.on(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks);
		this.config.events.on(Event.CHAIN_REORG, this.onChainReorg);
	}

	closeEventListeners() {
		this.config.events.off(Event.PROTOCOL_MESSAGE, this.onProtocolMessage);
		this.config.events.off(Event.POOL_PEER_ADDED, this.onPoolPeerAdded);
		this.config.events.off(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks);
		this.config.events.off(Event.CHAIN_REORG, this.onChainReorg);
	}

	protected override error(err: Error | string) {
		const message = err instanceof Error ? err.message : err;
		this.config.options.logger?.error(message);
	}

	protected override debug(message: string, _method = "debug") {
		this.config.options.logger?.debug(message);
	}
}
