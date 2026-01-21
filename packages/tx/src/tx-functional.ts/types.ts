import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { Input } from '@ts-ethereum/rlp'
import type { Address, EOACode7702AuthorizationListBytes } from '@ts-ethereum/utils'
import type {
  AccessListBytes,
  Capability,
  JSONTx,
  TransactionCache,
  TransactionType,
  TxOptions,
  TxValuesArray,
} from '../types'

/**
 * TxData interface - equivalent to Go's TxData interface.
 * Each concrete tx type (LegacyTx, AccessListTx, etc.) implements this.
 */
export interface TxData {
  readonly type: TransactionType
  readonly nonce: bigint
  readonly gasLimit: bigint
  readonly to?: Address
  readonly value: bigint
  readonly data: Uint8Array
  readonly v?: bigint
  readonly r?: bigint
  readonly s?: bigint

  // Methods (implemented by each tx type)
  copy(): TxData
  chainID(): bigint
  accessList(): AccessListBytes | null
  gasPrice(): bigint
  gasTipCap(): bigint
  gasFeeCap(): bigint

  /**
   * Returns the raw V, R, S signature values.
   * Equivalent to Go's rawSignatureValues().
   */
  rawSignatureValues(): [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
  ]

  /**
   * Sets the signature values and returns a new TxData copy.
   * Equivalent to Go's setSignatureValues().
   */
  setSignatureValues(chainID: bigint, v: bigint, r: bigint, s: bigint): TxData

  effectiveGasPrice(baseFee?: bigint): bigint

  /**
   * Returns the hash to be signed by the sender.
   * Equivalent to Go's sigHash(chainID).
   * @param chainId - Chain ID to include in hash (0 for pre-EIP155)
   */
  sigHash(chainId: bigint): Uint8Array

  /**
   * Returns the raw RLP-encodable array including signature values.
   * The array may contain nested arrays for access lists, etc.
   */
  raw(): Input[]
}

/**
 * FrozenTx - immutable transaction wrapper.
 * Equivalent to Go's Transaction struct.
 */
export interface FrozenTx {
  readonly inner: TxData
  readonly common: HardforkManager
  readonly fork: string
  readonly cache: TransactionCache
  readonly txOptions: TxOptions
}

/**
 * Signer interface - equivalent to Go's Signer interface.
 *
 * Signers don't actually sign - they're for validating and processing signatures.
 * Each signer implementation handles a specific set of transaction types and
 * signature encoding rules.
 */
export interface Signer {
  /**
   * Returns the sender address of the transaction.
   * Equivalent to Go's Signer.Sender(tx).
   */
  sender(tx: TxManager): Address

  /**
   * Returns the raw R, S, V values corresponding to the given signature.
   * The signature must be in [R || S || V] format where V is 0 or 1.
   * Equivalent to Go's Signer.SignatureValues(tx, sig).
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): { r: bigint; s: bigint; v: bigint }

  /**
   * Returns the chain ID this signer is configured for.
   * Returns null for signers that don't use chain ID (Frontier, Homestead).
   * Equivalent to Go's Signer.ChainID().
   */
  chainID(): bigint | null

  /**
   * Returns the 'signature hash', i.e. the hash that is signed by the private key.
   * This hash does not uniquely identify the transaction.
   * Equivalent to Go's Signer.Hash(tx).
   */
  hash(tx: TxManager): Uint8Array

  /**
   * Returns true if the given signer is the same as the receiver.
   * Equivalent to Go's Signer.Equal(signer).
   */
  equal(other: Signer): boolean
}

/**
 * TxManager - functional API wrapper for transactions.
 * This is our TypeScript equivalent combining Go's Transaction methods
 * with your existing TransactionInterface API.
 */
export interface TxManager<T extends TransactionType = TransactionType> {
  readonly tx: FrozenTx

  // Properties matching TransactionInterface
  readonly common: HardforkManager
  readonly nonce: bigint
  readonly gasLimit: bigint
  readonly to?: Address
  readonly value: bigint
  readonly data: Uint8Array
  readonly v?: bigint
  readonly r?: bigint
  readonly s?: bigint
  readonly cache: TransactionCache
  readonly fork: string
  readonly type: TransactionType
  readonly txOptions: TxOptions

  // ============================================================================
  // Go-style methods (primary API)
  // ============================================================================

  /**
   * Returns a new transaction with the given signature.
   * Signature must be in [R || S || V] format where V is 0 or 1.
   * Equivalent to Go's Transaction.WithSignature(signer, sig).
   */
  withSignature(signer: Signer, sig: Uint8Array): TxManager<T>

  /**
   * Returns whether the transaction is replay-protected.
   * Equivalent to Go's Transaction.Protected().
   */
  protected(): boolean

  /**
   * Returns the transaction hash (only valid for signed transactions).
   * Equivalent to Go's Transaction.Hash().
   */
  hash(): Uint8Array

  /**
   * Returns the raw V, R, S signature values.
   * Equivalent to Go's Transaction.RawSignatureValues().
   */
  rawSignatureValues(): [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
  ]

  /**
   * Returns the chain ID of the transaction.
   * Equivalent to Go's Transaction.ChainId().
   */
  chainId(): bigint

  // ============================================================================
  // Type checks
  // ============================================================================

  /**
   * Returns whether this is a typed transaction (EIP-2718).
   */
  isTypedTransaction(): boolean

  /**
   * @deprecated Use protected(), isTypedTransaction(), type checks instead
   */
  supports(capability: Capability): boolean

  // ============================================================================
  // Gas calculations
  // ============================================================================

  getIntrinsicGas(): bigint
  getDataGas(): bigint
  getUpfrontCost(baseFee?: bigint): bigint

  // ============================================================================
  // Serialization
  // ============================================================================

  toCreationAddress(): boolean
  raw(): TxValuesArray[T]
  serialize(): Uint8Array

  // ============================================================================
  // Validation
  // ============================================================================

  isSigned(): boolean
  isValid(): boolean
  getValidationErrors(): string[]
  verifySignature(): boolean

  // ============================================================================
  // Sender recovery (convenience - prefer using Sender(signer, tx) function)
  // ============================================================================

  getSenderAddress(): Address
  getSenderPublicKey(): Uint8Array

  // ============================================================================
  // JSON
  // ============================================================================

  toJSON(): JSONTx
  errorStr(): string

  // ============================================================================
  // Type-specific accessors (return undefined if not applicable to tx type)
  // ============================================================================

  /**
   * Returns the gas price for legacy/access list transactions.
   * For EIP-1559+ transactions, returns maxFeePerGas.
   */
  readonly gasPrice: bigint

  /**
   * Returns the max priority fee per gas (EIP-1559+).
   * Returns undefined for legacy/access list transactions.
   */
  readonly maxPriorityFeePerGas?: bigint

  /**
   * Returns the max fee per gas (EIP-1559+).
   * Returns undefined for legacy/access list transactions.
   */
  readonly maxFeePerGas?: bigint

  /**
   * Returns the access list for typed transactions.
   * Returns empty array for legacy transactions.
   */
  readonly accessList: AccessListBytes

  /**
   * Returns the max fee per blob gas (EIP-4844).
   * Returns undefined for non-blob transactions.
   */
  readonly maxFeePerBlobGas?: bigint

  /**
   * Returns the blob versioned hashes (EIP-4844).
   * Returns undefined for non-blob transactions.
   */
  readonly blobVersionedHashes?: readonly string[]

  /**
   * Returns the number of blobs (EIP-4844).
   * Returns 0 for non-blob transactions.
   */
  numBlobs(): number

  /**
   * Returns the authorization list (EIP-7702).
   * Returns undefined for non-7702 transactions.
   */
  readonly authorizationList?: EOACode7702AuthorizationListBytes

  /**
   * Returns the effective priority fee per gas.
   * For legacy/access list txs: gasPrice - baseFee
   * For EIP-1559+ txs: min(maxPriorityFeePerGas, maxFeePerGas - baseFee)
   */
  getEffectivePriorityFee(baseFee?: bigint): bigint
}
