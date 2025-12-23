import type { RegistryMetricCreator } from "../utils/registryMetricCreator.js";

export type RPCMetrics = ReturnType<typeof createRPCMetrics>;

/**
 * Create RPC metrics
 */
export function createRPCMetrics(register: RegistryMetricCreator) {
	return {
		requestsTotal: register.counter<{ method: string; status: string }>({
			name: "eth_rpc_requests_total",
			help: "Total number of RPC requests",
			labelNames: ["method", "status"],
		}),
		requestsDuration: register.histogram<{ method: string }>({
			name: "eth_rpc_request_duration_seconds",
			help: "RPC request duration",
			labelNames: ["method"],
			buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
		}),
		requestsErrors: register.counter<{ method: string; error_code: string }>({
			name: "eth_rpc_requests_errors_total",
			help: "Total number of RPC request errors",
			labelNames: ["method", "error_code"],
		}),
		requestsInFlight: register.gauge({
			name: "eth_rpc_requests_in_flight",
			help: "Current number of in-flight RPC requests",
		}),
		methodCalls: register.counter<{ method: string }>({
			name: "eth_rpc_method_calls_total",
			help: "Total number of RPC method calls",
			labelNames: ["method"],
		}),
	};
}
