import { ServerType, serve } from "@hono/node-server";
import debug from "debug";
import { Env, Hono } from "hono";
import { requestId } from "hono/request-id";
import { Chain } from "../blockchain";
import { Config } from "../config/index.ts";
import { VMExecution } from "../execution/vmexecution.ts";
import { Miner } from "../miner";
import { Network } from "../net/network.ts";
import type { Peer } from "../net/peer/peer.ts";
import { RPCArgs } from "../rpc/index.ts";
import { createRpcHandlers } from "../rpc/modules/index.ts";
import { rpcRequestSchema } from "../rpc/types.ts";
import { rpcValidator } from "../rpc/validation.ts";
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

const log = debug("p2p:node");

export const STATS_INTERVAL = 1000 * 30; // 30 seconds
export const MEMORY_SHUTDOWN_THRESHOLD = 92;

export type ProtocolMessage = {
	message: { name: string; data: unknown };
	protocol: string;
	peer: Peer;
};

type RpcManager = {
	server: ServerType;
	client: Hono<Env>;
	methods: string[];
	namespaces: string[];
};

/**
 * ExecutionNode - Main execution layer node combining client and service functionality
 * Following lodestar's beacon-node architecture pattern
 */
export class ExecutionNode {
	public config: Config;
	public chain: Chain;
	public execution: VMExecution;
	public network: Network;
	public synchronizer: FullSynchronizer;
	public txFetcher: TxFetcher;
	public rpcManager?: RpcManager;

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

		log("Creating Network");
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

		node.log("Waiting for synchronization...");

		const chainHeight = await new Promise<bigint | null>((resolve) => {
			const timeout = setTimeout(() => {
				cleanup();
				resolve(null);
			}, 30000);

			const onSynchronized = (chainHeight: bigint) => {
				cleanup();
				resolve(chainHeight);
			};

			const cleanup = () => {
				clearTimeout(timeout);
				node.config.events.off(Event.SYNC_SYNCHRONIZED, onSynchronized);
			};
			node.config.events.on(Event.SYNC_SYNCHRONIZED, onSynchronized);
		});

		node.started = true;
		if (chainHeight === null) return;

		node.rpcManager = await node.createRpcManager({
			rpc: true,
			rpcAddr: "127.0.0.1",
			rpcPort: node.config.options.port + 300,
		});
		node.log(
			`RPC server listening on http://127.0.0.1:${node.config.options.port + 300}`,
		);

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

		this.config.events.on(Event.CLIENT_SHUTDOWN, async () => {
			if (this.rpcManager !== undefined) return;
			await this.close();
		});

		log("ExecutionNode created");
	}

	private createRpcManager = async (rpcArgs: RPCArgs) => {
		return await new Promise<RpcManager>((resolve, reject) => {
			const { rpcHandlers, methods } = createRpcHandlers(this, true);
			const namespaces = methods.map((m) => m.split("_")[0]);

			const onTimeout = () => {
				reject(new Error("RPC server timed out"));
			};

			const timeout = setTimeout(onTimeout, 30000);

			const client = new Hono<Env>()
				.use("*", requestId({ generator: () => Date.now().toString() }))
				.post("/", rpcValidator(rpcRequestSchema), rpcHandlers);

			const server = serve(
				{
					fetch: client.fetch,
					port: rpcArgs.rpcPort,
					hostname: rpcArgs.rpcAddr,
				},
				(i) => {
					console.log(`Rpc listening on ${i?.address}`);
					clearTimeout(timeout);
					resolve({ server, client, methods, namespaces });
				},
			);
		});
	};

	async stop(): Promise<boolean> {
		try {
			if (!this.running) return false;

			this.config.events.emit(Event.CLIENT_SHUTDOWN);

			this.network.txPool.stop();
			this.network.miner?.stop();

			await this.synchronizer?.stop();
			await this.execution.stop();

			if (this.opened) {
				await this.close();
				await this.synchronizer?.close();
			}

			await this.network.stop();
			clearInterval(this.statsInterval);
			await this.synchronizer?.stop();

			await this.config.node.stop();

			this.running = false;
			this.txFetcher.stop();

			log("ExecutionNode stopped");
			return true;
		} catch (error) {
			this.error(error as Error);
			this.debug(`Error stopping: ${(error as Error).message}`);
			this.running = false;
			return false;
		}
	}

	async close(): Promise<boolean> {
		if (!this.opened) return false;
		try {
			this.network.txPool.close();
			const result = !!this.opened;
			if (this.opened) {
				await this.network.close();
				this.opened = false;
			}

			return result;
		} catch (error) {
			this.error(error as Error);
			this.debug(`Error closing: ${(error as Error).message}`);
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
			this.error(error as Error);
			this.debug(`Error building headstate: ${(error as Error).message}`);
		} finally {
			this.building = false;
		}
	}

	protected stats() {
		if (!this.v8Engine) return;

		const heapStats = this.v8Engine.getHeapStatistics();
		const { used_heap_size, heap_size_limit } = heapStats;

		const heapUsed = Math.round(used_heap_size / 1000 / 1000); // MB
		const percentage = Math.round((100 * used_heap_size) / heap_size_limit);

		this.log(`Memory stats usage=${heapUsed} MB percentage=${percentage}%`);

		if (this.statsCounter % 4 === 0) this.statsCounter = 0;

		if (percentage >= MEMORY_SHUTDOWN_THRESHOLD && !this.config.shutdown) {
			this.log("EMERGENCY SHUTDOWN DUE TO HIGH MEMORY LOAD...");
			process.kill(process.pid, "SIGINT");
		}
		this.statsCounter += 1;
	}

	protected log(message: string) {
		this.config.options.logger?.info(`ExecutionNode log: ${message}`);
	}

	protected error(err: Error) {
		this.config.options.logger?.error(
			`ExecutionNode error: ${err} stack: ${err.stack}`,
		);
	}

	protected debug(message: string, method: string = "debug") {
		this.config.options.logger?.debug(
			`ExecutionNode ${method} msg: ${message}}`,
		);
	}

	public peers = () => {
		return this.network.getConnectedPeers().map((p) => p.id);
	};

	public node = () => this.config.node;
	public server = () => this.config.node;
	public peerCount = () => this.network.getPeerCount();

	// Access txPool through network
	public get txPool(): TxPool {
		return this.network.txPool;
	}

	// Access miner through network
	public get miner(): Miner | undefined {
		return this.network.miner;
	}
}
