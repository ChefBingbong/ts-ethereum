import type { RegistryMetricCreator } from "../utils/registryMetricCreator.js";

export type ErrorMetrics = ReturnType<typeof createErrorMetrics>;

/**
 * Create error tracking metrics
 */
export function createErrorMetrics(register: RegistryMetricCreator) {
	return {
		errorsTotal: register.counter<{
			category: string;
			code: string;
			severity: string;
		}>({
			name: "eth_errors_total",
			help: "Total number of errors by category, code, and severity",
			labelNames: ["category", "code", "severity"],
		}),
		errorsByCategory: register.counter<{ category: string }>({
			name: "eth_errors_by_category_total",
			help: "Total number of errors by category",
			labelNames: ["category"],
		}),
		errorsByRecoveryType: register.counter<{ recovery_type: string }>({
			name: "eth_errors_by_recovery_type_total",
			help: "Total number of errors by recovery type",
			labelNames: ["recovery_type"],
		}),
		recoverableErrors: register.counter({
			name: "eth_recoverable_errors_total",
			help: "Total number of recoverable errors",
		}),
		fatalErrors: register.counter({
			name: "eth_fatal_errors_total",
			help: "Total number of fatal errors",
		}),
		transientErrors: register.counter({
			name: "eth_transient_errors_total",
			help: "Total number of transient errors",
		}),
		permanentErrors: register.counter({
			name: "eth_permanent_errors_total",
			help: "Total number of permanent errors",
		}),
		errorRetries: register.counter<{ category: string; code: string }>({
			name: "eth_error_retries_total",
			help: "Total number of error retries",
			labelNames: ["category", "code"],
		}),
		errorRetryFailures: register.counter<{ category: string; code: string }>({
			name: "eth_error_retry_failures_total",
			help: "Total number of error retry failures",
			labelNames: ["category", "code"],
		}),
	};
}

