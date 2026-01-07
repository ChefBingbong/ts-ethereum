import type { HardforkManager } from '@ts-ethereum/chain-config'
import type {
  Address,
  EOACode7702AuthorizationListBytes,
  PrefixedHexString,
} from '@ts-ethereum/utils'
import type {
  AccessListBytes,
  Capability,
  JSONTx,
  JSONRPCTx,
  TransactionType,
  TxValuesArray,
  TypedTxData,
} from '../types'

/**
 * Base interface for all transaction data types (similar to go-ethereum's TxData).
 * Each concrete transaction type (Legacy, AccessList, DynamicFee, etc.) implements this interface.
 */
export interface TxData {
  /**
   * Returns the transaction type identifier.
   */
  txType(): TransactionType

  /**
   * Creates a deep copy of the transaction data.
   */
  copy(): TxData

  /**
   * Returns the chain ID, or undefined if not applicable.
   */
  chainId(): bigint | undefined

  /**
   * Returns the access list, or empty array if not applicable.
   */
  accessList(): AccessListBytes

  /**
   * Returns the transaction data (input data).
   */
  data(): Uint8Array

  /**
   * Returns the gas limit.
   */
  gas(): bigint

  /**
   * Returns the gas price (for legacy transactions) or maxFeePerGas (for EIP-1559+).
   */
  gasPrice(): bigint

  /**
   * Returns the max priority fee per gas (tip), or gasPrice for legacy transactions.
   */
  gasTipCap(): bigint

  /**
   * Returns the max fee per gas (cap), or gasPrice for legacy transactions.
   */
  gasFeeCap(): bigint

  /**
   * Returns the value transferred in wei.
   */
  value(): bigint

  /**
   * Returns the transaction nonce.
   */
  nonce(): bigint

  /**
   * Returns the recipient address, or undefined for contract creation.
   */
  to(): Address | undefined

  /**
   * Returns the raw signature values (v, r, s).
   */
  rawSignatureValues(): { v?: bigint; r?: bigint; s?: bigint }

  /**
   * Sets the signature values on the transaction data.
   * Note: This mutates the TxData, but should only be called during construction.
   */
  setSignatureValues(
    chainID: bigint | undefined,
    v: bigint,
    r: bigint,
    s: bigint,
  ): void

  /**
   * Computes the effective gas price paid by the transaction, given the inclusion block base fee.
   * @param baseFee - The base fee per gas of the block (undefined for pre-EIP-1559 blocks)
   * @returns The effective gas price in wei
   */
  effectiveGasPrice(baseFee: bigint | undefined): bigint

  /**
   * Returns the hash of the transaction that should be signed.
   * @param chainID - The chain ID to use for the signature hash
   */
  sigHash(chainID: bigint | undefined): Uint8Array
}

/**
 * Immutable transaction state containing validated data and computed caches.
 * Similar to FrozenBlockHeader in the block package.
 */
export interface FrozenTransaction {
  readonly inner: TxData
  readonly hardforkManager: HardforkManager
  readonly _cache: {
    readonly hash?: Uint8Array
    readonly size?: number
    readonly sender?: Address
  }
}

/**
 * Options for creating a transaction.
 */
export interface CreateTxOptions {
  readonly hardforkManager: HardforkManager
  readonly freeze?: boolean
  readonly allowUnlimitedInitCodeSize?: boolean
  readonly hardfork?: string | { blockNumber: bigint; timestamp?: bigint }
}

/**
 * Immutable transaction manager interface.
 * Provides a purely functional API for working with transactions.
 * Similar to BlockHeaderManager in the block package.
 */
export interface TransactionManager {
  readonly transaction: FrozenTransaction

  // Accessors
  nonce(): bigint
  gasLimit(): bigint
  value(): bigint
  data(): Uint8Array
  to(): Address | undefined
  chainId(): bigint | undefined
  gasPrice(): bigint
  maxPriorityFeePerGas(): bigint | undefined
  maxFeePerGas(): bigint | undefined
  maxFeePerBlobGas(): bigint | undefined
  blobVersionedHashes(): Uint8Array[] | undefined
  authorizationList(): EOACode7702AuthorizationListBytes | undefined

  // Transaction type
  type(): TransactionType

  // Signature
  isSigned(): boolean
  getSenderAddress(): Address
  verifySignature(): boolean
  getMessageToSign(): Uint8Array | Uint8Array[]
  getHashedMessageToSign(): Uint8Array

  // Serialization
  hash(): Uint8Array
  serialize(): Uint8Array
  raw(): TxValuesArray
  toJSON(): JSONTx

  // Gas calculations
  getIntrinsicGas(): bigint
  getDataGas(): bigint
  getUpfrontCost(): bigint
  effectiveGasPrice(baseFee?: bigint): bigint

  // Validation
  isValid(): boolean
  getValidationErrors(): string[]

  // Capabilities
  supports(capability: Capability): boolean

  // Utility
  toCreationAddress(): boolean
}

/**
 * Re-export types from main types file for convenience.
 */
export type {
  TypedTxData,
  JSONTx,
  JSONRPCTx,
  TxValuesArray,
  AccessListBytes,
  TransactionType,
  Capability,
}

