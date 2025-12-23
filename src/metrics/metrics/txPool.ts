import type { RegistryMetricCreator } from "../utils/registryMetricCreator.js";

export type TxPoolMetrics = ReturnType<typeof createTxPoolMetrics>;

/**
 * Create transaction pool metrics
 */
export function createTxPoolMetrics(register: RegistryMetricCreator) {
	return {
		pendingTransactions: register.gauge({
			name: "eth_txpool_pending_transactions",
			help: "Number of pending transactions",
		}),
		queuedTransactions: register.gauge({
			name: "eth_txpool_queued_transactions",
			help: "Number of queued transactions",
		}),
		transactionsAdded: register.counter({
			name: "eth_txpool_transactions_added_total",
			help: "Total number of transactions added to pool",
		}),
		transactionsRemoved: register.counter({
			name: "eth_txpool_transactions_removed_total",
			help: "Total number of transactions removed from pool",
		}),
		transactionsBroadcast: register.counter({
			name: "eth_txpool_transactions_broadcast_total",
			help: "Total number of transactions broadcast",
		}),
		transactionValidationErrors: register.counter<{ error_type: string }>({
			name: "eth_txpool_transaction_validation_errors_total",
			help: "Total number of transaction validation errors",
			labelNames: ["error_type"],
		}),
		poolSizeBytes: register.gauge({
			name: "eth_txpool_size_bytes",
			help: "Size of transaction pool in bytes",
		}),
	};
}
