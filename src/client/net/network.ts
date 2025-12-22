import debug from "debug";
import type { Block } from "../../block";
import type { P2PNode } from "../../p2p/libp2p/types.ts";
import type { Chain } from "../blockchain/chain.ts";
import type { Config } from "../config/index.ts";
import type { VMExecution } from "../execution";
import { Miner } from "../miner";
import { TxPool } from "../service/txpool.ts";
import { FullSynchronizer } from "../sync";
import { Event } from "../types.ts";
import { NetworkCore } from "./core/index.ts";
import type { Peer } from "./peer/peer.ts";
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
} from "./protocol/eth/handlers.ts";

const log = debug("p2p:network");

/**
 * Network service initialization options
 */
export interface NetworkInitOptions {
	config: Config;
	node: P2PNode;
	chain: Chain;
	execution: VMExecution;
}

/**
 * Modules for Network constructor (following lodestar pattern)
 */
export interface NetworkModules {
	config: Config;
	node: P2PNode;
	chain?: Chain;
	execution: VMExecution;
	core: NetworkCore;
	txPool: TxPool | null;
	miner?: Miner;
	synchronizer?: FullSynchronizer;
}

/**
 * Network - Main network service that wraps NetworkCore
 * Provides a clean public API for network operations
 *
 * Similar to lodestar's Network class, but adapted for execution layer.
 */
export class Network {
	public readonly core: NetworkCore;
	public readonly chain: Chain;
	public readonly execution: VMExecution;
	public txPool: TxPool;
	public miner: Miner;
	public synchronizer: FullSynchronizer;

	/**
	 * Initialize Network with static init method (following lodestar pattern)
	 */
	static async init(options: NetworkInitOptions): Promise<Network> {
		log("Initializing Network");
		const core = await NetworkCore.init(options);

		// Create TxPool with network as pool
		const txPool = new TxPool({
			config: options.config,
			pool: core,
			chain: options.chain,
			execution: options.execution,
		});

		const synchronizer = new FullSynchronizer({
			core: core,
			txPool,
			execution: options.execution,
			interval: 1000,
		});

		const miner = new Miner({
			config: options.config,
			txPool: txPool,
			synchronizer: synchronizer,
			chain: options.chain,
			execution: options.execution,
		});
		// Create Network instance first
		const network = new Network({
			config: options.config,
			node: options.node,
			chain: options.chain,
			execution: options.execution,
			synchronizer,
			miner,
			core,
			txPool,
		});

		await options.execution.open();
		
		txPool.open();
		await synchronizer?.open();
		synchronizer.opened = true;

		return network;
	}

	constructor(modules: NetworkModules) {
		log("Creating Network service");
		this.core = modules.core;
		this.chain = modules.chain;
		this.execution = modules.execution;
		this.txPool = modules.txPool!;
		this.miner = modules.miner;
		this.synchronizer = modules.synchronizer;

		// Set up event handlers
		this.setupEventListeners();
		log("Network service created");
	}

	private setupEventListeners(): void {
		this.config.events.on(Event.PROTOCOL_MESSAGE, this.onProtocolMessage);
		this.config.events.on(Event.POOL_PEER_ADDED, this.onPoolPeerAdded);
		this.config.events.on(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks);
		this.config.events.on(Event.CHAIN_REORG, this.onChainReorg);
	}

	/**
	 * Remove event listeners
	 */
	private removeEventListeners(): void {
		this.config.events.off(Event.PROTOCOL_MESSAGE, this.onProtocolMessage);
		this.config.events.off(Event.POOL_PEER_ADDED, this.onPoolPeerAdded);
		this.config.events.off(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks);
		this.config.events.off(Event.CHAIN_REORG, this.onChainReorg);
	}

	/**
	 * Handle protocol messages (following lodestar pattern - separate handler method)
	 */
	private onProtocolMessage = async (message: {
		message: { name: string; data: unknown };
		protocol: string;
		peer: Peer;
	}): Promise<void> => {
		if (message.protocol !== "eth") return;
		if (!this.chain || !this.execution) return;

		const context: EthHandlerContext = {
			chain: this.chain,
			txPool: this.txPool,
			synchronizer: this.synchronizer,
			execution: this.execution,
			pool: this,
		};

		try {
			switch (message.message.name) {
				case "GetBlockHeaders":
					await handleGetBlockHeaders(
						message.message.data as Parameters<typeof handleGetBlockHeaders>[0],
						message.peer,
						context,
					);
					break;

				case "GetBlockBodies":
					await handleGetBlockBodies(
						message.message.data as Parameters<typeof handleGetBlockBodies>[0],
						message.peer,
						context,
					);
					break;

				case "NewBlockHashes":
					handleNewBlockHashes(
						message.message.data as Parameters<typeof handleNewBlockHashes>[0],
						context,
					);
					break;

				case "Transactions":
					await handleTransactions(
						message.message.data as Parameters<typeof handleTransactions>[0],
						message.peer,
						context,
					);
					break;

				case "NewBlock":
					await handleNewBlock(
						message.message.data as Parameters<typeof handleNewBlock>[0],
						message.peer,
						context,
					);
					break;

				case "NewPooledTransactionHashes":
					await handleNewPooledTransactionHashes(
						message.message.data as Parameters<
							typeof handleNewPooledTransactionHashes
						>[0],
						message.peer,
						context,
					);
					break;

				case "GetPooledTransactions":
					handleGetPooledTransactions(
						message.message.data as Parameters<
							typeof handleGetPooledTransactions
						>[0],
						message.peer,
						context,
					);
					break;

				case "GetReceipts":
					await handleGetReceipts(
						message.message.data as Parameters<typeof handleGetReceipts>[0],
						message.peer,
						context,
					);
					break;
			}
		} catch (error) {
			const err = error as Error;
			this.config.options.logger?.error(err);
			this.config.options.logger?.debug(
				`Error handling ${message.message.name}: ${err.message}`,
			);
		}
	};

	/**
	 * Handle pool peer added event
	 */
	private onPoolPeerAdded = (peer: Peer): void => {
		if (!this.txPool) return;

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

	/**
	 * Handle sync new blocks event
	 */
	private onSyncNewBlocks = async (blocks: Block[]): Promise<void> => {
		if (!this.txPool) return;

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
			this.config.options.logger?.error(error as Error);
			this.config.options.logger?.debug(`${(error as Error).message}`);
		}
	};

	/**
	 * Handle chain reorg event
	 */
	private onChainReorg = async (
		oldBlocks: Block[],
		newBlocks: Block[],
	): Promise<void> => {
		if (!this.txPool) return;

		try {
			await this.txPool.handleReorg(oldBlocks, newBlocks);
		} catch (error) {
			this.config.options.logger?.error(error as Error);
			this.config.options.logger?.debug(`${(error as Error).message}`);
		}
	};

	/**
	 * Stop network service
	 */
	async stop(): Promise<boolean> {
		return this.core.stop();
	}

	/**
	 * Close network service
	 */
	async close(): Promise<void> {
		this.removeEventListeners();
		return this.core.close();
	}

	
	/**
	 * Running state (backward compatibility)
	 */
	get running(): boolean {
		return this.core.running;
	}

	/**
	 * Config (backward compatibility)
	 */
	get config(): Config {
		return this.core.config;
	}
}
