import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { Address } from '@ts-ethereum/utils'
import type {
  AccessListBytes,
  Capability,
  JSONTx,
  Transaction,
  TransactionCache,
  TransactionType,
  TxOptions,
  TxValuesArray,
} from '../types'

/**
 * TxData interface - equivalent to Go's TxData interface
 * Each concrete tx type implements this
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
  rawSignatureValues(): [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
  ]
  setSignatureValues(chainID: bigint, v: bigint, r: bigint, s: bigint): TxData
  effectiveGasPrice(baseFee?: bigint): bigint
  /**
   * Returns the unsigned transaction fields to be hashed for signing.
   * @param chainId - The chain ID to include if supportsEIP155 is true
   * @param supportsEIP155 - Whether to include chainId for replay protection
   */
  getMessageToSign(chainId: bigint, supportsEIP155: boolean): Uint8Array[]
  /**
   * Returns the hash of the unsigned transaction for signing.
   * @param chainId - Chain ID for EIP-155. Pass 0n for pre-EIP155 signing.
   */
  sigHash(chainId: bigint): Uint8Array
  /**
   * Returns the raw RLP-encodable array including signature values.
   */
  raw(): Uint8Array[]
}

/**
 * Frozen transaction - immutable wrapper (like Go's Transaction struct)
 */
export interface FrozenTx {
  readonly inner: TxData
  readonly common: HardforkManager
  readonly fork: string
  readonly cache: TransactionCache
  readonly txOptions: TxOptions
  /**
   * Active capabilities for this transaction type.
   * Used by supports() to determine what features the tx supports.
   */
  readonly activeCapabilities?: Capability[]
}

/**
 * Transaction Manager - functional API wrapper matching your TransactionInterface
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

  // Methods matching TransactionInterface
  supports(capability: Capability): boolean
  getIntrinsicGas(): bigint
  getDataGas(): bigint
  getUpfrontCost(): bigint
  toCreationAddress(): boolean
  raw(): TxValuesArray[T]
  serialize(): Uint8Array
  getMessageToSign(): Uint8Array | Uint8Array[]
  getHashedMessageToSign(): Uint8Array
  hash(): Uint8Array
  getMessageToVerifySignature(): Uint8Array
  getValidationErrors(): string[]
  isSigned(): boolean
  isValid(): boolean
  verifySignature(): boolean
  getSenderAddress(): Address
  getSenderPublicKey(): Uint8Array
  sign(
    privateKey: Uint8Array,
    extraEntropy?: Uint8Array | boolean,
  ): Transaction[T]
  toJSON(): JSONTx
  errorStr(): string
  addSignature(
    v: bigint,
    r: Uint8Array | bigint,
    s: Uint8Array | bigint,
    convertV?: boolean,
  ): Transaction[T]
}

/**
 * Signer interface - equivalent to Go's Signer interface
 */
export interface Signer {
  /**
   * Returns the sender address of the transaction
   */
  getSenderAddress(tx: TxManager): Address

  /**
   * Returns the raw R, S, V values corresponding to the given signature
   */
  signatureValues(tx: TxManager, sig: Uint8Array): [bigint, bigint, bigint]

  /**
   * Returns the chain ID this signer is configured for
   */
  chainID(): bigint | null

  /**
   * Returns the hash of the transaction that should be signed
   */
  hash(tx: TxManager): Uint8Array

  /**
   * Returns true if the given signer is the same as the receiver
   */
  equal(other: Signer): boolean
}
