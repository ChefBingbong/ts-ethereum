import debug from "debug";
import { Chain } from "../blockchain";
import type { Config } from "../config/index.ts";
import { VMExecution } from "../execution/vmexecution.ts";
import { P2PPeerPool } from "../net/p2p-peerpool.ts";
import type { FullSynchronizer } from "../sync";
import type { V8Engine } from "../util";
import type { ServiceOptions } from "./fullethereumservice-types.ts";

const log = debug("service");

export const STATS_INTERVAL = 1000 * 30; // 30 seconds
export const MEMORY_SHUTDOWN_THRESHOLD = 92;

export abstract class Service {
	public config: Config;
	public execution: VMExecution;
	public synchronizer: FullSynchronizer;
	public pool: P2PPeerPool;
	public chain: Chain;

	public opened: boolean;
	public running: boolean;
	public interval: number;
	public timeout: number;
	public name: string;
	public protocols: string[];

	protected v8Engine?: V8Engine;
	protected statsInterval: NodeJS.Timeout | undefined; /* global NodeJS */
	protected statsCounter = 0;

	constructor(options: ServiceOptions) {
		this.config = options.config;
		this.name = "eth";
		this.protocols = [];
		this.opened = false;
		this.running = false;

		this.chain = options.chain ?? Chain.createSync(options);

		this.execution = new VMExecution({
			config: options.config,
			stateDB: options.stateDB,
			metaDB: options.metaDB,
			chain: this.chain,
		});
		log("Creating P2PPeerPool");
		this.pool = new P2PPeerPool({
			config: this.config,
			node: this.config.node,
			chain: this.chain,
			execution: this.execution,
		});

		this.interval = options.interval ?? 200;
		this.timeout = options.timeout ?? 6000;
		this.opened = false;
		this.running = false;
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

	abstract open(): Promise<boolean>;
	abstract close(): Promise<boolean>;
	abstract start(): Promise<boolean>;
	abstract stop(): Promise<boolean>;

	protected log(message: string) {
		this.config.options.logger?.info(`${this.name} service log: ${message}`);
	}

	protected error(err: Error) {
		this.config.options.logger?.error(
			`${this.name} service error: ${err} stack: ${err.stack}`,
		);
	}

	protected debug(message: string, method: string) {
		this.config.options.logger?.debug(
			`${this.name} service ${method} msg: ${message}}`,
		);
	}

	abstract handle(_message: any): Promise<any>;
}
