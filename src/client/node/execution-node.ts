import { Chain } from "../blockchain";
import { Config } from "../config/index.ts";
import { VMExecution } from "../execution/vmexecution.ts";
import { Miner } from "../miner";
import { Network } from "../net/network.ts";
import type { Peer } from "../net/peer/peer.ts";
import { RpcServer } from "../rpc/server/index.ts";
import { TxPool } from "../service/txpool.ts";
import { FullSynchronizer } from "../sync";
import { TxFetcher } from "../sync/fetcher/txFetcher.ts";
import { Event } from "../types.ts";
import type { V8Engine } from "../util/index.ts";
import { getV8Engine } from "../util/index.ts";
import type {
    ExecutionNodeInitOptions,
    ExecutionNodeModules,
} from "./types.ts";

export const STATS_INTERVAL = 1000 * 30; // 30 seconds
export const MEMORY_SHUTDOWN_THRESHOLD = 92;

export type ProtocolMessage = {
	message: { name: string; data: unknown };
	protocol: string;
	peer: Peer;
};

export class ExecutionNode {
	public config: Config;
	public chain: Chain;
	public execution: VMExecution;
	public network: Network;
	public synchronizer: FullSynchronizer;
	public txFetcher: TxFetcher;
	public rpcServer?: RpcServer;
	public isRpcReady: boolean;

	public opened: boolean;
	public running: boolean;
	public interval: number;
	public timeout: number;
	public name: string;
	public protocols: string[];

	protected v8Engine?: V8Engine;
	protected statsInterval: NodeJS.Timeout | undefined;
	protected statsCounter = 0;
	private building = false;
	private started = false;

	public static async init(
		options: ExecutionNodeInitOptions,
	): Promise<ExecutionNode> {
		const chain = await Chain.create(options);

		const execution = new VMExecution({
			config: options.config,
			stateDB: options.stateDB,
			metaDB: options.metaDB,
			chain,
		});

		const network = await Network.init({
			config: options.config,
			node: options.config.node,
			chain,
			execution,
		});

		const txFetcher = new TxFetcher({
			config: options.config,
			pool: network.core,
			txPool: network.txPool,
		});

		const node = new ExecutionNode({
			config: options.config,
			chain,
			execution,
			network,
			synchronizer: network.synchronizer,
			txFetcher: txFetcher,
			txPool: network.txPool,
		});

		node.config.updateSynchronizedState(node.chain.headers.latest, true);
		node.network.txPool.checkRunState();

		if (node.running) return;
		void node.synchronizer?.start();

		if (!node.v8Engine) {
			node.v8Engine = await getV8Engine();
		}

		node.statsInterval = setInterval(node.stats.bind(node), STATS_INTERVAL);

		node.running = true;
		node.network.miner?.start();

		await node.execution.start();
		await node.execution.run();

		void node.buildHeadState();
		node.txFetcher.start();
		await node.config.node.start();

		const rpcServer = new RpcServer(
			{
				enabled: true,
				address:  "127.0.0.1",
				port: options.config.options.port + 300,
				cors: "*",
				debug: false,
				stacktraces: false,
			},
			{
				logger: node.config.options.logger!,
				node,
			},
		);

		const onRpcReady = async() => {
            await rpcServer.listen();
            node.rpcServer = rpcServer;
			node.isRpcReady = true;
			node.config.events.off(Event.SYNC_SYNCHRONIZED, onRpcReady);
		};

		node.config.events.on(Event.SYNC_SYNCHRONIZED, onRpcReady);
		return node;
	}

	protected constructor(modules: ExecutionNodeModules) {
		this.config = modules.config;
		this.chain = modules.chain;
		this.execution = modules.execution;
		this.network = modules.network;
		this.synchronizer = modules.synchronizer;
		this.txFetcher = modules.txFetcher;

		this.name = "eth";
		this.protocols = [];
		this.opened = false;
		this.running = false;
		this.interval = 200;
		this.timeout = 6000;
		this.isRpcReady = false;

		this.config.events.on(Event.CLIENT_SHUTDOWN, async () => {
			if (this.rpcServer !== undefined) return;
			await this.close();
		});
	}

	async stop(): Promise<boolean> {
		try {
			if (!this.running) return false;
			this.config.events.emit(Event.CLIENT_SHUTDOWN);
			clearInterval(this.statsInterval);

			await this.rpcServer?.close?.();
			await this.close?.();
			return true;
		} catch (error) {
			this.running = false;
			return false;
		}
	}

	async close(): Promise<boolean> {
		try {
			if (!this.opened) return false;
			await this.network.close();
			this.txFetcher.stop();
			this.opened = false;
			this.running = false;
			this.isRpcReady = false;
			return true;
		} catch (error) {
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
		} finally {
			this.building = false;
		}
	}

	protected stats() {
		if (!this.v8Engine) return;

		const heapStats = this.v8Engine.getHeapStatistics();
		const { used_heap_size, heap_size_limit } = heapStats;

		const percentage = Math.round((100 * used_heap_size) / heap_size_limit);
		if (this.statsCounter % 4 === 0) this.statsCounter = 0;

		if (percentage >= MEMORY_SHUTDOWN_THRESHOLD && !this.config.shutdown) {
			process.kill(process.pid, "SIGINT");
		}
		this.statsCounter += 1;
	}

	public peers = () => {
		return this.network.core.getConnectedPeers().map((p) => p.id);
	};

	public node = () => this.config.node;
	public server = () => this.config.node;
	public peerCount = () => this.network.core.getPeerCount();

	public get txPool(): TxPool {
		return this.network.txPool;
	}

	public get miner(): Miner | undefined {
		return this.network.miner;
	}
}
