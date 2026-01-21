import type {
  AccessListBytes,
  Capability,
  TransactionType,
  TxOptions,
  TxValuesArray,
} from '../types'
import { TransactionType as TxType } from '../types'
import * as helpers from './helpers'
import type { AccessListTxData } from './tx-access-list'
import type { BlobTxData } from './tx-blob'
import type { DynamicFeeTxData } from './tx-dynamic-fee'
import type { SetCodeTxData } from './tx-set-code'
import type { FrozenTx, Signer, TxData, TxManager } from './types'

/**
 * NewTx creates a new transaction.
 * Equivalent to Go's NewTx function.
 */
export function newTx(txData: TxData, opts: TxOptions): TxManager {
  const fork = opts.common.getHardforkFromContext(opts.hardfork)

  const frozenTx: FrozenTx = {
    inner: txData,
    common: opts.common,
    fork,
    cache: {},
    txOptions: opts,
  }
  return createTxManagerFromTx(frozenTx)
}

/**
 * Create TxManager from frozen tx.
 * This is our TypeScript equivalent of Go's Transaction struct methods.
 */
export function createTxManagerFromTx<T extends TransactionType>(
  tx: FrozenTx,
): TxManager<T> {
  const manager: TxManager<T> = {
    tx,

    // ============================================================================
    // Property accessors
    // ============================================================================

    get common() {
      return tx.common
    },
    get nonce() {
      return tx.inner.nonce
    },
    get gasLimit() {
      return tx.inner.gasLimit
    },
    get to() {
      return tx.inner.to
    },
    get value() {
      return tx.inner.value
    },
    get data() {
      return tx.inner.data
    },
    get v() {
      return tx.inner.v
    },
    get r() {
      return tx.inner.r
    },
    get s() {
      return tx.inner.s
    },
    get cache() {
      return tx.cache
    },
    get fork() {
      return tx.fork
    },
    get type() {
      return tx.inner.type
    },
    get txOptions() {
      return tx.txOptions
    },

    // ============================================================================
    // Go-style methods (primary API)
    // ============================================================================

    /**
     * Returns a new transaction with the given signature.
     * Equivalent to Go's Transaction.WithSignature(signer, sig).
     */
    withSignature(signer: Signer, sig: Uint8Array): TxManager<T> {
      const { r, s, v } = signer.signatureValues(manager, sig)

      // Create new inner tx with signature values
      const chainId = signer.chainID() ?? 0n
      const newInner = tx.inner.setSignatureValues(chainId, v, r, s)

      // Create new FrozenTx with updated inner
      const newFrozenTx: FrozenTx = {
        inner: newInner,
        common: tx.common,
        fork: tx.fork,
        cache: {},
        txOptions: tx.txOptions,
      }

      return createTxManagerFromTx(newFrozenTx)
    },

    /**
     * Returns whether the transaction is replay-protected.
     * Equivalent to Go's Transaction.Protected().
     */
    protected: () => helpers.isProtected(tx),

    /**
     * Returns the transaction hash (only valid for signed transactions).
     * Equivalent to Go's Transaction.Hash().
     */
    hash: () => helpers.hash(tx),

    /**
     * Returns the raw V, R, S signature values.
     * Equivalent to Go's Transaction.RawSignatureValues().
     */
    rawSignatureValues: () => tx.inner.rawSignatureValues(),

    /**
     * Returns the chain ID of the transaction.
     * Equivalent to Go's Transaction.ChainId().
     */
    chainId: () => tx.inner.chainID(),

    // ============================================================================
    // Type checks
    // ============================================================================

    isTypedTransaction: () => helpers.isTypedTransaction(tx),
    supports: (capability: Capability) => helpers.supports(tx, capability),

    // ============================================================================
    // Gas calculations
    // ============================================================================

    getIntrinsicGas: () => helpers.getIntrinsicGas(tx),
    getDataGas: () => helpers.getDataGas(tx),
    getUpfrontCost: (baseFee?: bigint) => helpers.getUpfrontCost(tx, baseFee),

    // ============================================================================
    // Serialization
    // ============================================================================

    toCreationAddress: () => helpers.toCreationAddress(tx),
    raw: () => tx.inner.raw() as TxValuesArray[T],
    serialize: () => helpers.serialize(tx),

    // ============================================================================
    // Validation
    // ============================================================================

    isSigned: () => helpers.isSigned(tx),
    isValid: () => helpers.isValid(tx),
    getValidationErrors: () => helpers.getValidationErrors(tx),
    verifySignature: () => helpers.verifySignature(tx),

    // ============================================================================
    // Sender recovery (convenience methods)
    // ============================================================================

    getSenderAddress: () => helpers.getSenderAddress(tx),
    getSenderPublicKey: () => helpers.getSenderPublicKey(tx),

    // ============================================================================
    // JSON
    // ============================================================================

    toJSON: () => helpers.toJSON(tx),
    errorStr: () => helpers.errorStr(tx),

    // ============================================================================
    // Type-specific accessors
    // ============================================================================

    get gasPrice() {
      return tx.inner.gasPrice()
    },
    get maxPriorityFeePerGas() {
      if (
        tx.inner.type === TxType.FeeMarketEIP1559 ||
        tx.inner.type === TxType.BlobEIP4844 ||
        tx.inner.type === TxType.EOACodeEIP7702
      ) {
        return (tx.inner as unknown as DynamicFeeTxData).maxPriorityFeePerGas
      }
      return undefined
    },
    get maxFeePerGas() {
      if (
        tx.inner.type === TxType.FeeMarketEIP1559 ||
        tx.inner.type === TxType.BlobEIP4844 ||
        tx.inner.type === TxType.EOACodeEIP7702
      ) {
        return (tx.inner as unknown as DynamicFeeTxData).maxFeePerGas
      }
      return undefined
    },
    get accessList(): AccessListBytes {
      const list = tx.inner.accessList()
      return list ?? []
    },
    get maxFeePerBlobGas() {
      if (tx.inner.type === TxType.BlobEIP4844) {
        return (tx.inner as unknown as BlobTxData).maxFeePerBlobGas
      }
      return undefined
    },
    get blobVersionedHashes() {
      if (tx.inner.type === TxType.BlobEIP4844) {
        return (tx.inner as unknown as BlobTxData).blobVersionedHashes
      }
      return undefined
    },
    numBlobs() {
      if (tx.inner.type === TxType.BlobEIP4844) {
        return (tx.inner as unknown as BlobTxData).blobVersionedHashes.length
      }
      return 0
    },
    get authorizationList():
      | import('@ts-ethereum/utils').EOACode7702AuthorizationListBytes
      | undefined {
      if (tx.inner.type === TxType.EOACodeEIP7702) {
        return (tx.inner as unknown as SetCodeTxData)
          .authorizationList as import('@ts-ethereum/utils').EOACode7702AuthorizationListBytes
      }
      return undefined
    },
    getEffectivePriorityFee(baseFee?: bigint): bigint {
      const fee = baseFee ?? 0n
      if (
        tx.inner.type === TxType.FeeMarketEIP1559 ||
        tx.inner.type === TxType.BlobEIP4844 ||
        tx.inner.type === TxType.EOACodeEIP7702
      ) {
        const inner = tx.inner as unknown as DynamicFeeTxData
        // min(maxPriorityFeePerGas, maxFeePerGas - baseFee)
        const maxPriority = inner.maxPriorityFeePerGas
        const maxMinusBase = inner.maxFeePerGas - fee
        return maxPriority < maxMinusBase ? maxPriority : maxMinusBase
      }
      // Legacy/access list - return gasPrice - baseFee
      return tx.inner.gasPrice() - fee
    },
  }

  return Object.freeze(manager)
}
