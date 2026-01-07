import type { Address } from '@ts-ethereum/utils'
import type { FrozenTransaction } from '../types'

/**
 * Gets the transaction nonce.
 */
export function getNonce(tx: FrozenTransaction): bigint {
  return tx.inner.nonce()
}

/**
 * Gets the transaction gas limit.
 */
export function getGasLimit(tx: FrozenTransaction): bigint {
  return tx.inner.gas()
}

/**
 * Gets the transaction value in wei.
 */
export function getValue(tx: FrozenTransaction): bigint {
  return tx.inner.value()
}

/**
 * Gets the transaction data (input data).
 */
export function getData(tx: FrozenTransaction): Uint8Array {
  return tx.inner.data()
}

/**
 * Gets the transaction recipient address, or undefined for contract creation.
 */
export function getTo(tx: FrozenTransaction): Address | undefined {
  return tx.inner.to()
}

/**
 * Gets the transaction chain ID, or undefined if not applicable.
 */
export function getChainId(tx: FrozenTransaction): bigint | undefined {
  return tx.inner.chainId()
}

/**
 * Gets the transaction type.
 */
export function getTxType(tx: FrozenTransaction): number {
  return tx.inner.txType()
}

/**
 * Gets the gas price (for legacy transactions) or maxFeePerGas (for EIP-1559+).
 */
export function getGasPrice(tx: FrozenTransaction): bigint {
  return tx.inner.gasPrice()
}

/**
 * Gets the max priority fee per gas (tip), or gasPrice for legacy transactions.
 */
export function getMaxPriorityFeePerGas(
  tx: FrozenTransaction,
): bigint | undefined {
  const txType = tx.inner.txType()
  // Legacy and AccessList transactions don't have maxPriorityFeePerGas
  if (txType === 0 || txType === 1) {
    return undefined
  }
  return tx.inner.gasTipCap()
}

/**
 * Gets the max fee per gas (cap), or gasPrice for legacy transactions.
 */
export function getMaxFeePerGas(tx: FrozenTransaction): bigint | undefined {
  const txType = getTxType(tx)
  // Legacy and AccessList transactions don't have maxFeePerGas
  if (txType === 0 || txType === 1) {
    return undefined
  }
  return tx.inner.gasFeeCap()
}

/**
 * Gets the max fee per blob gas (for blob transactions).
 */
export function getMaxFeePerBlobGas(tx: FrozenTransaction): bigint | undefined {
  const txType = getTxType(tx)
  if (txType === 3) {
    // Blob transaction
    const blobTx = tx.inner as any
    return blobTx.maxFeePerBlobGas
  }
  return undefined
}

/**
 * Gets the number of blobs in a blob transaction.
 */
export function numBlobs(tx: FrozenTransaction): number {
  const txType = getTxType(tx)
  if (txType === 3) {
    // Blob transaction
    const blobTx = tx.inner as any
    return blobTx.blobVersionedHashes?.length ?? 0
  }
  return 0
}

/**
 * Gets blob versioned hashes (for blob transactions).
 */
export function getBlobVersionedHashes(
  tx: FrozenTransaction,
): Uint8Array[] | undefined {
  const txType = getTxType(tx)
  if (txType === 3) {
    // Blob transaction
    const blobTx = tx.inner as any
    return blobTx.blobVersionedHashes
  }
  return undefined
}

/**
 * Gets the authorization list (for EIP-7702 transactions).
 */
export function getAuthorizationList(
  tx: FrozenTransaction,
): any[] | undefined {
  const txType = getTxType(tx)
  if (txType === 4) {
    // EOA Code transaction
    const eoaTx = tx.inner as any
    return eoaTx.authorizationList
  }
  return undefined
}

/**
 * Gets the access list (for EIP-2930+ transactions).
 */
export function getAccessList(tx: FrozenTransaction): any[] {
  return tx.inner.accessList()
}

