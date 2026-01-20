import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { Address } from '@ts-ethereum/utils'
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
   */
  raw(): Uint8Array[]
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
  getUpfrontCost(): bigint

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
}
