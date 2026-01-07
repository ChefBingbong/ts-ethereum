import { RLP } from '@ts-ethereum/rlp'
import {
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToHex,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { JSONTx, TxValuesArray } from '../../types'
import { TransactionType } from '../../types'
import type { FrozenTransaction } from '../types'
import {
  getChainId,
  getData,
  getGasLimit,
  getGasPrice,
  getMaxFeePerGas,
  getMaxPriorityFeePerGas,
  getNonce,
  getTo,
  getTxType,
  getValue,
} from './accessors'
import { getRawSignatureValues } from './signature'

/**
 * Computes the hash of a signed transaction.
 * Caches the result in the transaction's _cache.
 */
export function computeHash(tx: FrozenTransaction): Uint8Array {
  if (tx._cache.hash !== undefined) {
    return tx._cache.hash
  }

  const serialized = serialize(tx)
  const hash = keccak256(serialized)

  // Cache the hash (mutation allowed here for caching)
  ;(tx._cache as { hash?: Uint8Array }).hash = hash

  return hash
}

/**
 * Computes the size of a serialized transaction in bytes.
 * Caches the result in the transaction's _cache.
 */
export function computeSize(tx: FrozenTransaction): number {
  if (tx._cache.size !== undefined) {
    return tx._cache.size
  }

  const serialized = serialize(tx)
  const size = serialized.length

  // Cache the size (mutation allowed here for caching)
  ;(tx._cache as { size?: number }).size = size

  return size
}

/**
 * Serializes a transaction to RLP format.
 */
export function serialize(tx: FrozenTransaction): Uint8Array {
  const txType = getTxType(tx)
  const raw = raw_(tx)

  if (txType === TransactionType.Legacy) {
    // Legacy transactions: just RLP encode the raw array
    return RLP.encode(raw)
  } else {
    // Typed transactions (EIP-2718): [type, rlp(payload)]
    return RLP.encode([txType, RLP.encode(raw)])
  }
}

/**
 * Gets the raw transaction values array.
 * This is a low-level function - use serialize() for the final format.
 */
export function raw_(tx: FrozenTransaction): TxValuesArray {
  const txType = getTxType(tx)
  const inner = tx.inner
  const sig = getRawSignatureValues(tx)

  if (txType === TransactionType.Legacy) {
    return [
      bigIntToUnpaddedBytes(getNonce(tx)),
      bigIntToUnpaddedBytes(getGasPrice(tx)),
      bigIntToUnpaddedBytes(getGasLimit(tx)),
      getTo(tx) !== undefined ? getTo(tx)!.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(getValue(tx)),
      getData(tx),
      sig.v !== undefined ? bigIntToUnpaddedBytes(sig.v) : new Uint8Array(0),
      sig.r !== undefined ? bigIntToUnpaddedBytes(sig.r) : new Uint8Array(0),
      sig.s !== undefined ? bigIntToUnpaddedBytes(sig.s) : new Uint8Array(0),
    ] as TxValuesArray
  }

  // For typed transactions, we need to access the inner TxData's raw format
  // This is a simplified version - full implementation would handle each type
  throw new Error(
    `Raw format for transaction type ${txType} not yet implemented in functional helpers`,
  )
}

/**
 * Converts a transaction to JSON format.
 */
export function toJSON(tx: FrozenTransaction): JSONTx {
  const txType = getTxType(tx)
  const sig = getRawSignatureValues(tx)
  const chainId = getChainId(tx)

  const base: JSONTx = {
    type: bigIntToHex(BigInt(txType)),
    nonce: bigIntToHex(getNonce(tx)),
    gasLimit: bigIntToHex(getGasLimit(tx)),
    to: getTo(tx) !== undefined ? getTo(tx)!.toString() : undefined,
    value: bigIntToHex(getValue(tx)),
    data: bytesToHex(getData(tx)),
    v: sig.v !== undefined ? bigIntToHex(sig.v) : undefined,
    r: sig.r !== undefined ? bigIntToHex(sig.r) : undefined,
    s: sig.s !== undefined ? bigIntToHex(sig.s) : undefined,
    chainId: chainId !== undefined ? bigIntToHex(chainId) : undefined,
    yParity: sig.v === 0n || sig.v === 1n ? bigIntToHex(sig.v) : undefined,
  }

  // Add type-specific fields
  if (txType === TransactionType.Legacy) {
    base.gasPrice = bigIntToHex(getGasPrice(tx))
  } else if (
    txType === TransactionType.AccessListEIP2930 ||
    txType === TransactionType.FeeMarketEIP1559 ||
    txType === TransactionType.BlobEIP4844 ||
    txType === TransactionType.EOACodeEIP7702
  ) {
    const maxFeePerGas = getMaxFeePerGas(tx)
    const maxPriorityFeePerGas = getMaxPriorityFeePerGas(tx)

    if (maxFeePerGas !== undefined) {
      base.maxFeePerGas = bigIntToHex(maxFeePerGas)
    }
    if (maxPriorityFeePerGas !== undefined) {
      base.maxPriorityFeePerGas = bigIntToHex(maxPriorityFeePerGas)
    }

    // For legacy compatibility, gasPrice defaults to maxFeePerGas for EIP-1559+
    if (txType !== TransactionType.AccessListEIP2930) {
      base.gasPrice =
        maxFeePerGas !== undefined ? bigIntToHex(maxFeePerGas) : undefined
    } else {
      base.gasPrice = bigIntToHex(getGasPrice(tx))
    }
  }

  return base
}

/**
 * Gets the hash of a transaction (cached).
 */
export function getHash(tx: FrozenTransaction): Uint8Array {
  return computeHash(tx)
}

/**
 * Gets the raw transaction values array.
 */
export function raw(tx: FrozenTransaction): TxValuesArray {
  return raw_(tx)
}
