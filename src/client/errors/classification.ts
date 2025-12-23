/**
 * Error Classification Utilities
 *
 * Provides utilities for classifying and handling errors
 */

import {
	ClientError,
	ExecutionError,
	NetworkError,
	StateError,
	SyncError,
	SystemError,
	ValidationError,
} from "./base.ts";
import {
	ErrorCategory,
	ErrorCode,
	type ErrorContext,
	ErrorRecoveryType,
} from "./types.ts";

/**
 * Classify an unknown error into a ClientError
 */
export function classifyError(
	error: unknown,
	context?: ErrorContext,
): ClientError {
	// If already a ClientError, return as-is
	if (error instanceof ClientError) {
		if (context) {
			// Merge context if provided
			return new ClientError(error.message, {
				code: error.code,
				category: error.category,
				severity: error.severity,
				recoveryType: error.recoveryType,
				metadata: error.metadata,
				context: { ...error.context, ...context },
				retryable: error.retryable,
				maxRetries: error.maxRetries,
				backoffMs: error.backoffMs,
				cause: error.cause,
			});
		}
		return error;
	}

	// Convert standard Error to ClientError
	if (error instanceof Error) {
		const message = error.message || "Unknown error";
		const errorMessage = message.toLowerCase();

		// Classify based on error message patterns
		if (
			errorMessage.includes("network") ||
			errorMessage.includes("peer") ||
			errorMessage.includes("connection") ||
			errorMessage.includes("timeout")
		) {
			return new NetworkError(message, {
				code: ErrorCode.NETWORK_TIMEOUT,
				context,
				retryable: true,
				maxRetries: 3,
				backoffMs: 1000,
				cause: error,
			});
		}

		if (
			errorMessage.includes("vm") ||
			errorMessage.includes("execution") ||
			errorMessage.includes("gas") ||
			errorMessage.includes("revert")
		) {
			return new ExecutionError(message, {
				code: ErrorCode.VM_EXECUTION_ERROR,
				context,
				retryable: false,
				cause: error,
			});
		}

		if (
			errorMessage.includes("sync") ||
			errorMessage.includes("block") ||
			errorMessage.includes("header")
		) {
			return new SyncError(message, {
				code: ErrorCode.SYNC_ERROR,
				context,
				retryable: true,
				maxRetries: 5,
				backoffMs: 2000,
				cause: error,
			});
		}

		if (
			errorMessage.includes("state") ||
			errorMessage.includes("root") ||
			errorMessage.includes("corruption")
		) {
			return new StateError(message, {
				code: ErrorCode.STATE_CORRUPTION,
				context,
				retryable: false,
				cause: error,
			});
		}

		if (
			errorMessage.includes("invalid") ||
			errorMessage.includes("validation") ||
			errorMessage.includes("malformed")
		) {
			return new ValidationError(message, {
				code: ErrorCode.INVALID_INPUT,
				context,
				cause: error,
			});
		}

		// Default to SystemError
		return new SystemError(message, {
			code: ErrorCode.SYSTEM_ERROR,
			context,
			retryable: true,
			maxRetries: 3,
			backoffMs: 1000,
			cause: error,
		});
	}

	// Handle non-Error objects
	const message = String(error);
	return new SystemError(message, {
		code: ErrorCode.SYSTEM_ERROR,
		context,
		retryable: false,
	});
}

/**
 * Check if error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
	if (error instanceof ClientError) {
		return (
			error.recoveryType === ErrorRecoveryType.RECOVERABLE ||
			error.recoveryType === ErrorRecoveryType.TRANSIENT
		);
	}
	return false;
}

/**
 * Check if error is fatal
 */
export function isFatal(error: unknown): boolean {
	if (error instanceof ClientError) {
		return error.recoveryType === ErrorRecoveryType.FATAL;
	}
	return false;
}

/**
 * Check if error is transient
 */
export function isTransient(error: unknown): boolean {
	if (error instanceof ClientError) {
		return error.recoveryType === ErrorRecoveryType.TRANSIENT;
	}
	return false;
}

/**
 * Check if error is permanent
 */
export function isPermanent(error: unknown): boolean {
	if (error instanceof ClientError) {
		return error.recoveryType === ErrorRecoveryType.PERMANENT;
	}
	return false;
}

/**
 * Get error category from error
 */
export function getErrorCategory(error: unknown): ErrorCategory {
	if (error instanceof ClientError) {
		return error.category;
	}
	return ErrorCategory.SYSTEM;
}

/**
 * Create error context helper
 */
export function createErrorContext(
	component?: string,
	operation?: string,
	additional?: Record<string, unknown>,
): ErrorContext {
	return {
		component,
		operation,
		...additional,
	};
}
