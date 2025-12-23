/**
 * Base Error Classes
 *
 * Provides structured error handling with categories, codes, and recovery strategies
 */

import type {
	ErrorCategory,
	ErrorCode,
	ErrorContext,
	ErrorMetadata,
	ErrorRecoveryType,
	ErrorSeverity,
} from "./types.ts";

/**
 * Base error class for all client errors
 */
export class ClientError extends Error {
	public readonly code: ErrorCode;
	public readonly category: ErrorCategory;
	public readonly severity: ErrorSeverity;
	public readonly recoveryType: ErrorRecoveryType;
	public readonly metadata?: ErrorMetadata;
	public readonly context?: ErrorContext;
	public readonly retryable: boolean;
	public readonly maxRetries?: number;
	public readonly backoffMs?: number;
	public readonly timestamp: number;

	constructor(
		message: string,
		options: {
			code: ErrorCode;
			category: ErrorCategory;
			severity?: ErrorSeverity;
			recoveryType?: ErrorRecoveryType;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			maxRetries?: number;
			backoffMs?: number;
			cause?: Error;
		},
	) {
		super(message, { cause: options.cause });
		this.name = this.constructor.name;
		this.code = options.code;
		this.category = options.category;
		this.severity = options.severity ?? ErrorSeverity.MEDIUM;
		this.recoveryType =
			options.recoveryType ?? ErrorRecoveryType.RECOVERABLE;
		this.metadata = options.metadata;
		this.context = options.context;
		this.retryable = options.retryable ?? false;
		this.maxRetries = options.maxRetries;
		this.backoffMs = options.backoffMs;
		this.timestamp = Date.now();

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Serialize error for logging or RPC responses
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			category: this.category,
			severity: this.severity,
			recoveryType: this.recoveryType,
			retryable: this.retryable,
			maxRetries: this.maxRetries,
			backoffMs: this.backoffMs,
			metadata: this.metadata,
			context: this.context,
			timestamp: this.timestamp,
			stack: this.stack,
		};
	}

	/**
	 * Check if error should be retried
	 */
	shouldRetry(attemptCount: number): boolean {
		if (!this.retryable) return false;
		if (this.maxRetries !== undefined && attemptCount >= this.maxRetries) {
			return false;
		}
		return this.recoveryType === ErrorRecoveryType.RECOVERABLE ||
			this.recoveryType === ErrorRecoveryType.TRANSIENT;
	}

	/**
	 * Get backoff delay for retry
	 */
	getBackoffMs(attemptCount: number): number {
		if (this.backoffMs) {
			// Exponential backoff: backoffMs * 2^attemptCount
			return this.backoffMs * Math.pow(2, attemptCount);
		}
		// Default exponential backoff starting at 100ms
		return 100 * Math.pow(2, attemptCount);
	}
}

/**
 * Network-related errors
 */
export class NetworkError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			maxRetries?: number;
			backoffMs?: number;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.NETWORK,
			recoveryType: options.retryable !== false
				? ErrorRecoveryType.TRANSIENT
				: ErrorRecoveryType.PERMANENT,
			severity: ErrorSeverity.MEDIUM,
		});
	}
}

/**
 * Execution/VM-related errors
 */
export class ExecutionError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.EXECUTION,
			recoveryType: ErrorRecoveryType.PERMANENT,
			severity: ErrorSeverity.HIGH,
			retryable: options.retryable ?? false,
		});
	}
}

/**
 * Synchronization-related errors
 */
export class SyncError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			maxRetries?: number;
			backoffMs?: number;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.SYNC,
			recoveryType: options.retryable !== false
				? ErrorRecoveryType.RECOVERABLE
				: ErrorRecoveryType.FATAL,
			severity: ErrorSeverity.HIGH,
		});
	}
}

/**
 * Validation-related errors
 */
export class ValidationError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.VALIDATION,
			recoveryType: ErrorRecoveryType.PERMANENT,
			severity: ErrorSeverity.MEDIUM,
			retryable: false,
		});
	}
}

/**
 * State-related errors
 */
export class StateError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.STATE,
			recoveryType: ErrorRecoveryType.FATAL,
			severity: ErrorSeverity.CRITICAL,
			retryable: options.retryable ?? false,
		});
	}
}

/**
 * System-related errors
 */
export class SystemError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.SYSTEM,
			recoveryType: options.retryable !== false
				? ErrorRecoveryType.RECOVERABLE
				: ErrorRecoveryType.FATAL,
			severity: ErrorSeverity.CRITICAL,
		});
	}
}

/**
 * RPC-related errors
 */
export class RpcError extends ClientError {
	constructor(
		message: string,
		options: {
			code: ErrorCode;
			metadata?: ErrorMetadata;
			context?: ErrorContext;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message, {
			...options,
			category: ErrorCategory.RPC,
			recoveryType: ErrorRecoveryType.PERMANENT,
			severity: ErrorSeverity.LOW,
			retryable: options.retryable ?? false,
		});
	}
}

