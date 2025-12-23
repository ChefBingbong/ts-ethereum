import { Metric, Registry } from "prom-client";
import { ChainMetrics, createChainMetrics } from "./metrics/chain.js";
import { createErrorMetrics, ErrorMetrics } from "./metrics/errors.js";
import {
	createExecutionMetrics,
	ExecutionMetrics,
} from "./metrics/execution.js";
import { createMinerMetrics, MinerMetrics } from "./metrics/miner.js";
import { createNetworkMetrics, NetworkMetrics } from "./metrics/network.js";
import { createPrometheusMetrics } from "./metrics/prometheus.js";
import { createRPCMetrics, RPCMetrics } from "./metrics/rpc.js";
import { createSyncMetrics, SyncMetrics } from "./metrics/sync.js";
import { createSystemMetrics, SystemMetrics } from "./metrics/system.js";
import { createTxPoolMetrics, TxPoolMetrics } from "./metrics/txPool.js";
import { collectNodeJSMetrics } from "./nodeJsMetrics.js";
import { MetricsOptions } from "./options.js";
import { RegistryMetricCreator } from "./utils/registryMetricCreator.js";

export type Metrics = {
	chain: ChainMetrics;
	network: NetworkMetrics;
	execution: ExecutionMetrics;
	sync: SyncMetrics;
	txPool: TxPoolMetrics;
	miner: MinerMetrics;
	system: SystemMetrics;
	rpc: RPCMetrics;
	errors: ErrorMetrics;
	register: RegistryMetricCreator;
	prometheus: ReturnType<typeof createPrometheusMetrics>;
	close: () => void;
};

export function createMetrics(
	opts: MetricsOptions,
	externalRegistries: Registry[] = [],
): Metrics {
	const register = new RegistryMetricCreator();
	const chain = createChainMetrics(register);
	const network = createNetworkMetrics(register);
	const execution = createExecutionMetrics(register);
	const sync = createSyncMetrics(register);
	const txPool = createTxPoolMetrics(register);
	const miner = createMinerMetrics(register);
	const system = createSystemMetrics(register);
	const rpc = createRPCMetrics(register);
	const errors = createErrorMetrics(register);
	const prometheus = createPrometheusMetrics(register);

	// Set metadata if provided
	if (opts.metadata) {
		register.static({
			name: "eth_node_version",
			help: "Node version information",
			value: opts.metadata,
		});
	}

	const close = collectNodeJSMetrics(register, opts.prefix);

	// Merge external registries
	for (const externalRegister of externalRegistries) {
		for (const metric of externalRegister.getMetricsAsArray()) {
			register.registerMetric(metric as unknown as Metric<string>);
		}
	}

	return {
		chain,
		network,
		execution,
		sync,
		txPool,
		miner,
		system,
		rpc,
		errors,
		register,
		prometheus,
		close,
	};
}
