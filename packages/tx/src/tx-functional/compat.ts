import type { TypedTransaction } from '../types'
import type { FrozenTransaction, CreateTxOptions } from './types'
import { fromTxData } from './creators'

/**
 * Converts a TypedTransaction (class-based) to FrozenTransaction (functional).
 * This is a compatibility helper for gradual migration.
 */
export function toFrozenTransaction(
  tx: TypedTransaction,
  opts: CreateTxOptions,
): FrozenTransaction {
  // Extract transaction data from the class-based transaction
  const txData: any = {
    type: tx.type,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit,
    value: tx.value,
    data: tx.data,
    to: tx.to?.bytes,
    v: tx.v,
    r: tx.r,
    s: tx.s,
  }

  // Add type-specific fields
  if (tx.type === 0) {
    // Legacy
    txData.gasPrice = (tx as any).gasPrice
  } else if (tx.type === 1) {
    // AccessList
    txData.chainId = (tx as any).chainId
    txData.gasPrice = (tx as any).gasPrice
    txData.accessList = (tx as any).accessList
  } else if (tx.type === 2) {
    // EIP-1559
    txData.chainId = (tx as any).chainId
    txData.maxPriorityFeePerGas = (tx as any).maxPriorityFeePerGas
    txData.maxFeePerGas = (tx as any).maxFeePerGas
    txData.accessList = (tx as any).accessList
  } else if (tx.type === 3) {
    // Blob
    txData.chainId = (tx as any).chainId
    txData.maxPriorityFeePerGas = (tx as any).maxPriorityFeePerGas
    txData.maxFeePerGas = (tx as any).maxFeePerGas
    txData.accessList = (tx as any).accessList
    txData.maxFeePerBlobGas = (tx as any).maxFeePerBlobGas
    txData.blobVersionedHashes = (tx as any).blobVersionedHashes
  } else if (tx.type === 4) {
    // EOA Code
    txData.chainId = (tx as any).chainId
    txData.maxPriorityFeePerGas = (tx as any).maxPriorityFeePerGas
    txData.maxFeePerGas = (tx as any).maxFeePerGas
    txData.accessList = (tx as any).accessList
    txData.authorizationList = (tx as any).authorizationList
  }

  return fromTxData(txData, opts)
}

