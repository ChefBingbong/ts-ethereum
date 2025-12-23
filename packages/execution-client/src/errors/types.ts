/**
 * Error Type Definitions
 *
 * Defines error categories, codes, and types for structured error handling
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',
  EXECUTION = 'execution',
  SYNC = 'sync',
  VALIDATION = 'validation',
  STATE = 'state',
  SYSTEM = 'system',
  RPC = 'rpc',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error recovery type
 */
export enum ErrorRecoveryType {
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
}

/**
 * Error codes for different error scenarios
 */
export enum ErrorCode {
  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  PEER_DISCONNECTED = 'PEER_DISCONNECTED',
  PEER_CONNECTION_FAILED = 'PEER_CONNECTION_FAILED',
  NETWORK_PROTOCOL_ERROR = 'NETWORK_PROTOCOL_ERROR',
  NETWORK_MESSAGE_ERROR = 'NETWORK_MESSAGE_ERROR',

  // Execution errors
  VM_EXECUTION_ERROR = 'VM_EXECUTION_ERROR',
  VM_OUT_OF_GAS = 'VM_OUT_OF_GAS',
  VM_INVALID_JUMP = 'VM_INVALID_JUMP',
  VM_STACK_OVERFLOW = 'VM_STACK_OVERFLOW',
  VM_STACK_UNDERFLOW = 'VM_STACK_UNDERFLOW',
  VM_INVALID_OPCODE = 'VM_INVALID_OPCODE',
  VM_REVERT = 'VM_REVERT',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',

  // State errors
  STATE_CORRUPTION = 'STATE_CORRUPTION',
  STATE_ROOT_MISMATCH = 'STATE_ROOT_MISMATCH',
  STATE_NOT_FOUND = 'STATE_NOT_FOUND',
  STATE_ACCESS_ERROR = 'STATE_ACCESS_ERROR',

  // Sync errors
  SYNC_ERROR = 'SYNC_ERROR',
  BLOCK_VALIDATION_FAILED = 'BLOCK_VALIDATION_FAILED',
  BLOCK_IMPORT_FAILED = 'BLOCK_IMPORT_FAILED',
  HEADER_VALIDATION_FAILED = 'HEADER_VALIDATION_FAILED',
  SYNC_PEER_ERROR = 'SYNC_PEER_ERROR',
  SYNC_FETCHER_ERROR = 'SYNC_FETCHER_ERROR',

  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_BLOCK = 'INVALID_BLOCK',
  INVALID_HEADER = 'INVALID_HEADER',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  INVALID_STATE_ROOT = 'INVALID_STATE_ROOT',
  INVALID_RECEIPT_ROOT = 'INVALID_RECEIPT_ROOT',

  // System errors
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  // RPC errors
  RPC_METHOD_NOT_FOUND = 'RPC_METHOD_NOT_FOUND',
  RPC_INVALID_PARAMS = 'RPC_INVALID_PARAMS',
  RPC_INTERNAL_ERROR = 'RPC_INTERNAL_ERROR',
  RPC_RATE_LIMIT = 'RPC_RATE_LIMIT',
}

/**
 * Error metadata type
 */
export type ErrorMetadata = Record<string, unknown>

/**
 * Error context for debugging
 */
export interface ErrorContext {
  component?: string
  operation?: string
  peerId?: string
  blockNumber?: number
  blockHash?: string
  txHash?: string
  [key: string]: unknown
}
