import type { RegistryMetricCreator } from "../utils/registryMetricCreator.js";

export type MinerMetrics = ReturnType<typeof createMinerMetrics>;

/**
 * Create miner metrics
 */
export function createMinerMetrics(register: RegistryMetricCreator) {
	return {
		mining: register.gauge({
			name: "eth_miner_mining",
			help: "Mining status (1=mining, 0=not mining)",
		}),
		blocksMined: register.counter({
			name: "eth_miner_blocks_mined_total",
			help: "Total number of blocks mined",
		}),
		miningErrors: register.counter<{ error_type: string }>({
			name: "eth_miner_mining_errors_total",
			help: "Total number of mining errors",
			labelNames: ["error_type"],
		}),
		miningTime: register.histogram({
			name: "eth_miner_mining_time_seconds",
			help: "Time spent mining blocks",
			buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
		}),
		powSolutionsFound: register.counter({
			name: "eth_miner_pow_solutions_found_total",
			help: "Total number of PoW solutions found",
		}),
		powSolutionsFailed: register.counter({
			name: "eth_miner_pow_solutions_failed_total",
			help: "Total number of failed PoW solution attempts",
		}),
	};
}
