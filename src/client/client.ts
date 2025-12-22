import { ServerType, serve } from "@hono/node-server";
import debug from "debug";
import { Env, Hono } from "hono";
import { requestId } from "hono/request-id";
import { Chain } from "./blockchain";
import { Config } from "./config/index.ts";
import { RPCArgs } from "./rpc/index.ts";
import { createRpcHandlers } from "./rpc/modules/index.ts";
import { rpcRequestSchema } from "./rpc/types.ts";
import { rpcValidator } from "./rpc/validation.ts";
import { P2PFullEthereumService } from "./service/p2p-fullethereumservice.ts";
import { Event, P2PEthereumClientOptions } from "./types.ts";
import { getPackageJSON } from "./util";

const log = debug("p2p:client");

type RpcManager = {
	server: ServerType;
	client: Hono<Env>;
	methods: string[];
	namespaces: string[];
};
export class EthereumClient {
	public config: Config;
	public chain: Chain;
	public service: P2PFullEthereumService;
	public rpcManager: RpcManager;

	public opened: boolean;
	public started: boolean;

	public static async create(options: P2PEthereumClientOptions) {
		const chain = await Chain.create(options);
		return new EthereumClient(chain, options);
	}

	protected constructor(chain: Chain, options: P2PEthereumClientOptions) {
		this.config = options.config;
		this.chain = chain;

		this.service = new P2PFullEthereumService({
			config: this.config,
			chainDB: options.chainDB,
			stateDB: options.stateDB,
			metaDB: options.metaDB,
			chain,
		});

		this.config.events.once(Event.SYNC_SYNCHRONIZED, async () => {
			if (this.rpcManager || !this.started) return;
			this.started = true;
			this.rpcManager = await this.createRpcManager({
				rpc: true,
				rpcAddr: "127.0.0.1",
				rpcPort: this.config.options.port + 300,
			});
			this.log(
				`RPC server listening on http://127.0.0.1:${this.config.options.port + 300}`,
			);
		});

		this.config.events.on(Event.CLIENT_SHUTDOWN, async () => {
			if (this.rpcManager !== undefined) return;
			await this.close();
		});

		this.opened = false;
		this.started = false;
		log("P2PEthereumClient created");
	}

	private createRpcManager = async (rpcArgs: RPCArgs) => {
		return await new Promise<RpcManager>((resolve, reject) => {
			const { rpcHandlers, methods } = createRpcHandlers(this, true);
			const namespaces = methods.map((m) => m.split("_")[0]);

			const onTimeout = () => {
				reject(new Error("RPC server timed out"));
			};

			const timeout = setTimeout(onTimeout, 10000);

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

	async open() {
		if (this.opened) return false;

		const name = this.config.chainCommon.chainName();
		const chainId = this.config.chainCommon.chainId();
		const packageJSON = getPackageJSON();

		this.config.options.logger?.info(
			`Initializing P2P Ethereumjs client version=v${packageJSON.version} network=${name} chainId=${chainId}`,
		);

		this.opened = await this.service.open();
	}

	async start() {
		try {
			if (!this.opened) await this.open();

			this.config.updateSynchronizedState(this.chain.headers.latest, true);
			this.service.txPool.checkRunState();

			if (this.started) return false;

			await this.service.start();
			await this.config.node.start();

			const service = this.service;
			await service.execution.open();
			await service.execution.run();

			this.log("Waiting for synchronization...");

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
					this.config.events.off(Event.SYNC_SYNCHRONIZED, onSynchronized);
				};
				this.config.events.on(Event.SYNC_SYNCHRONIZED, onSynchronized);
			});

			this.started = true;
			if (chainHeight === null) return;

			this.rpcManager = await this.createRpcManager({
				rpc: true,
				rpcAddr: "127.0.0.1",
				rpcPort: this.config.options.port + 300,
			});
			this.log(
				`RPC server listening on http://127.0.0.1:${this.config.options.port + 300}`,
			);
		} catch (error) {
			this.debug("Error starting client", "start()");
			this.error(error as Error);
			await this.close();
		}
	}

	async stop() {
		try {
			if (!this.started) return false;
			this.config.events.emit(Event.CLIENT_SHUTDOWN);

			await this.service.stop();
			await this.config.node.stop();

			this.started = false;
			await this.close();
			log("P2PEthereumClient stopped");
		} catch (error) {
			this.debug("Error stopping client", "stop()");
			this.error(error as Error);
			await this.close();
		}
	}

	async close() {
		if (!this.opened) return false;
		await this.service.close();
		this.opened = false;
	}

	protected log(message: string) {
		this.config.options.logger?.info(`EthereumClient log: ${message}`);
	}

	protected error(err: Error) {
		this.config.options.logger?.error(
			`EthereumClient error: ${err} stack: ${err.stack}`,
		);
	}

	protected debug(message: string, method: string) {
		this.config.options.logger?.debug(
			`EthereumClient debug: ${method} msg: ${message}}`,
		);
	}

	public peers = () => {
		return this.service.pool.peers
			.values()
			.toArray()
			.map((p) => p.id);
	};
	public node = () => this.config.node;
	public server = () => this.config.node;
	public peerCount = () => this.service.pool.size;
}
