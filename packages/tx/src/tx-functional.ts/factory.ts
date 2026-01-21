/**
 * Factory functions for creating TxManager instances.
 * These mirror the old factory functions but return TxManager instead of class instances.
 */
import { RLP } from '@ts-ethereum/rlp'
import type { EthersProvider, PrefixedHexString } from '@ts-ethereum/utils'
import {
  Address,
  bytesToBigInt,
  bytesToHex,
  EthereumJSErrorWithoutCode,
  fetchFromProvider,
  getProvider,
  hexToBytes,
  setLengthLeft,
  toBytes,
  validateNoLeadingZeroes,
} from '@ts-ethereum/utils'

import type {
  AccessListBytes,
  AccessList2930TxData as InputAccessList2930TxData,
  BlobEIP4844TxData as InputBlobEIP4844TxData,
  EOACode7702TxData as InputEOACode7702TxData,
  FeeMarketEIP1559TxData as InputFeeMarket1559TxData,
  LegacyTxData as InputLegacyTxData,
  TxOptions,
  TypedTxData,
} from '../types'
import {
  isAccessList2930TxData,
  isAccessListBytes,
  isBlob4844TxData,
  isEOACode7702TxData,
  isFeeMarket1559TxData,
  isLegacyTxData,
  TransactionType,
} from '../types'
import { normalizeTxParams } from '../util/general'
import { AccessListTxData } from './tx-access-list'
import { BlobTxData } from './tx-blob'
import { DynamicFeeTxData } from './tx-dynamic-fee'
import { LegacyTxData } from './tx-legacy'
import { newTx } from './tx-manager'
import { SetCodeTxData } from './tx-set-code'
import type { TxManager } from './types'

// ============================================================================
// Helper functions for data conversion
// ============================================================================

function toBigInt(value: unknown): bigint {
  if (value === undefined || value === null) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string') return BigInt(value)
  if (value instanceof Uint8Array) return bytesToBigInt(value)
  return BigInt(value as any)
}

function toUint8Array(value: unknown): Uint8Array {
  if (value === undefined || value === null) return new Uint8Array(0)
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') {
    // Handle hex strings
    if (value.startsWith('0x')) {
      return hexToBytes(value as PrefixedHexString)
    }
    return new Uint8Array(0)
  }
  return toBytes(value as number | bigint)
}

function bytesToAddress(bytes: Uint8Array): Address {
  if (bytes.length > 20) {
    throw new Error(`Invalid address, too long: ${bytes.length}`)
  }
  return new Address(setLengthLeft(bytes, 20))
}

function toAddress(value: unknown): Address | undefined {
  if (value === undefined || value === null) return undefined
  if (value instanceof Address) return value
  if (typeof value === 'object' && 'bytes' in value) return value as Address
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      const bytes = hexToBytes(value as PrefixedHexString)
      if (bytes.length === 0) return undefined
      return bytesToAddress(bytes)
    }
    return undefined
  }
  const bytes = toBytes(value as number | bigint)
  if (bytes.length === 0) return undefined
  return bytesToAddress(bytes)
}

function toAccessListBytes(accessList: unknown): AccessListBytes {
  if (!accessList || !Array.isArray(accessList)) return []
  if (isAccessListBytes(accessList as AccessListBytes)) {
    return accessList as AccessListBytes
  }
  // Convert from AccessList format to AccessListBytes
  return (accessList as Array<{ address: string; storageKeys: string[] }>).map(
    (item) => [
      hexToBytes(item.address as PrefixedHexString),
      item.storageKeys.map((k) => hexToBytes(k as PrefixedHexString)),
    ],
  )
}

// ============================================================================
// Legacy Transaction Factory
// ============================================================================

/**
 * Create a TxManager for a legacy transaction from input data.
 */
export function createLegacyTxManager(
  txData: InputLegacyTxData,
  opts: TxOptions,
): TxManager {
  const inner = new LegacyTxData({
    nonce: toBigInt(txData.nonce),
    gasPrice: toBigInt(txData.gasPrice),
    gasLimit: toBigInt(txData.gasLimit),
    to: toAddress(txData.to),
    value: toBigInt(txData.value),
    data: toUint8Array(txData.data),
    v: txData.v !== undefined ? toBigInt(txData.v) : undefined,
    r: txData.r !== undefined ? toBigInt(txData.r) : undefined,
    s: txData.s !== undefined ? toBigInt(txData.s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for a legacy transaction from a byte array.
 */
export function createLegacyTxManagerFromBytesArray(
  values: Uint8Array[],
  opts: TxOptions,
): TxManager {
  if (values.length !== 6 && values.length !== 9) {
    throw EthereumJSErrorWithoutCode(
      'Invalid transaction. Only expecting 6 values (for unsigned tx) or 9 values (for signed tx).',
    )
  }

  const [nonce, gasPrice, gasLimit, to, value, data, v, r, s] = values

  validateNoLeadingZeroes({ nonce, gasPrice, gasLimit, value, v, r, s })

  const inner = new LegacyTxData({
    nonce: bytesToBigInt(nonce ?? new Uint8Array(0)),
    gasPrice: bytesToBigInt(gasPrice ?? new Uint8Array(0)),
    gasLimit: bytesToBigInt(gasLimit ?? new Uint8Array(0)),
    to: to && to.length > 0 ? bytesToAddress(to) : undefined,
    value: bytesToBigInt(value ?? new Uint8Array(0)),
    data: data ?? new Uint8Array(0),
    v: v && v.length > 0 ? bytesToBigInt(v) : undefined,
    r: r && r.length > 0 ? bytesToBigInt(r) : undefined,
    s: s && s.length > 0 ? bytesToBigInt(s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for a legacy transaction from RLP-encoded bytes.
 */
export function createLegacyTxManagerFromRLP(
  serialized: Uint8Array,
  opts: TxOptions,
): TxManager {
  const values = RLP.decode(serialized)

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized tx input. Must be array',
    )
  }

  return createLegacyTxManagerFromBytesArray(values as Uint8Array[], opts)
}

// ============================================================================
// Access List (EIP-2930) Transaction Factory
// ============================================================================

/**
 * Create a TxManager for an EIP-2930 access list transaction.
 */
export function createAccessListTxManager(
  txData: InputAccessList2930TxData,
  opts: TxOptions,
): TxManager {
  const inner = new AccessListTxData({
    chainId: toBigInt(txData.chainId ?? opts.common.chainId()),
    nonce: toBigInt(txData.nonce),
    gasPrice: toBigInt(txData.gasPrice),
    gasLimit: toBigInt(txData.gasLimit),
    to: toAddress(txData.to),
    value: toBigInt(txData.value),
    data: toUint8Array(txData.data),
    accessList: toAccessListBytes(txData.accessList),
    v: txData.v !== undefined ? toBigInt(txData.v) : undefined,
    r: txData.r !== undefined ? toBigInt(txData.r) : undefined,
    s: txData.s !== undefined ? toBigInt(txData.s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for an EIP-2930 transaction from RLP-encoded bytes.
 */
export function createAccessListTxManagerFromRLP(
  serialized: Uint8Array,
  opts: TxOptions,
): TxManager {
  // First byte is the type (0x01), rest is RLP-encoded
  const values = RLP.decode(serialized.subarray(1))

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized tx input. Must be array',
    )
  }

  const [
    chainId,
    nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    data,
    accessList,
    v,
    r,
    s,
  ] = values as Uint8Array[]

  validateNoLeadingZeroes({
    chainId,
    nonce,
    gasPrice,
    gasLimit,
    value,
    v,
    r,
    s,
  })

  // For typed transactions, v (y-parity) can be 0, which RLP encodes as empty array
  // We determine if tx is signed by checking if r and s exist (they can't be 0 for valid sigs)
  const hasSig = r && r.length > 0 && s && s.length > 0

  const inner = new AccessListTxData({
    chainId: bytesToBigInt(chainId ?? new Uint8Array(0)),
    nonce: bytesToBigInt(nonce ?? new Uint8Array(0)),
    gasPrice: bytesToBigInt(gasPrice ?? new Uint8Array(0)),
    gasLimit: bytesToBigInt(gasLimit ?? new Uint8Array(0)),
    to: to && to.length > 0 ? bytesToAddress(to) : undefined,
    value: bytesToBigInt(value ?? new Uint8Array(0)),
    data: data ?? new Uint8Array(0),
    accessList: (accessList ?? []) as unknown as AccessListBytes,
    v: hasSig ? bytesToBigInt(v ?? new Uint8Array(0)) : undefined,
    r: hasSig ? bytesToBigInt(r) : undefined,
    s: hasSig ? bytesToBigInt(s) : undefined,
  })
  return newTx(inner, opts)
}

// ============================================================================
// Dynamic Fee (EIP-1559) Transaction Factory
// ============================================================================

/**
 * Create a TxManager for an EIP-1559 dynamic fee transaction.
 */
export function createDynamicFeeTxManager(
  txData: InputFeeMarket1559TxData,
  opts: TxOptions,
): TxManager {
  const inner = new DynamicFeeTxData({
    chainId: toBigInt(txData.chainId ?? opts.common.chainId()),
    nonce: toBigInt(txData.nonce),
    maxPriorityFeePerGas: toBigInt(txData.maxPriorityFeePerGas),
    maxFeePerGas: toBigInt(txData.maxFeePerGas),
    gasLimit: toBigInt(txData.gasLimit),
    to: toAddress(txData.to),
    value: toBigInt(txData.value),
    data: toUint8Array(txData.data),
    accessList: toAccessListBytes(txData.accessList),
    v: txData.v !== undefined ? toBigInt(txData.v) : undefined,
    r: txData.r !== undefined ? toBigInt(txData.r) : undefined,
    s: txData.s !== undefined ? toBigInt(txData.s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for an EIP-1559 transaction from RLP-encoded bytes.
 */
export function createDynamicFeeTxManagerFromRLP(
  serialized: Uint8Array,
  opts: TxOptions,
): TxManager {
  // First byte is the type (0x02), rest is RLP-encoded
  const values = RLP.decode(serialized.subarray(1))

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized tx input. Must be array',
    )
  }

  const [
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    to,
    value,
    data,
    accessList,
    v,
    r,
    s,
  ] = values as Uint8Array[]

  validateNoLeadingZeroes({
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    value,
    v,
    r,
    s,
  })

  // For typed transactions, v (y-parity) can be 0, which RLP encodes as empty array
  // We determine if tx is signed by checking if r and s exist (they can't be 0 for valid sigs)
  const hasSig = r && r.length > 0 && s && s.length > 0

  const inner = new DynamicFeeTxData({
    chainId: bytesToBigInt(chainId ?? new Uint8Array(0)),
    nonce: bytesToBigInt(nonce ?? new Uint8Array(0)),
    maxPriorityFeePerGas: bytesToBigInt(
      maxPriorityFeePerGas ?? new Uint8Array(0),
    ),
    maxFeePerGas: bytesToBigInt(maxFeePerGas ?? new Uint8Array(0)),
    gasLimit: bytesToBigInt(gasLimit ?? new Uint8Array(0)),
    to: to && to.length > 0 ? bytesToAddress(to) : undefined,
    value: bytesToBigInt(value ?? new Uint8Array(0)),
    data: data ?? new Uint8Array(0),
    accessList: (accessList ?? []) as unknown as AccessListBytes,
    v: hasSig ? bytesToBigInt(v ?? new Uint8Array(0)) : undefined,
    r: hasSig ? bytesToBigInt(r) : undefined,
    s: hasSig ? bytesToBigInt(s) : undefined,
  })
  return newTx(inner, opts)
}

// ============================================================================
// Blob (EIP-4844) Transaction Factory
// ============================================================================

/**
 * Create a TxManager for an EIP-4844 blob transaction.
 */
export function createBlobTxManager(
  txData: InputBlobEIP4844TxData,
  opts: TxOptions,
): TxManager {
  if (!txData.to) {
    throw EthereumJSErrorWithoutCode(
      'EIP-4844 blob transactions require a "to" address',
    )
  }

  // Convert blobVersionedHashes to PrefixedHexString[] if needed
  const hashes = (txData.blobVersionedHashes ?? []).map((h) => {
    if (typeof h === 'string') return h as PrefixedHexString
    if (h instanceof Uint8Array) return bytesToHex(h) as PrefixedHexString
    return bytesToHex(toBytes(h as number | bigint)) as PrefixedHexString
  })

  const inner = new BlobTxData({
    chainId: toBigInt(txData.chainId ?? opts.common.chainId()),
    nonce: toBigInt(txData.nonce),
    maxPriorityFeePerGas: toBigInt(txData.maxPriorityFeePerGas),
    maxFeePerGas: toBigInt(txData.maxFeePerGas),
    gasLimit: toBigInt(txData.gasLimit),
    to: toAddress(txData.to)!,
    value: toBigInt(txData.value),
    data: toUint8Array(txData.data),
    accessList: toAccessListBytes(txData.accessList),
    maxFeePerBlobGas: toBigInt(txData.maxFeePerBlobGas),
    blobVersionedHashes: hashes,
    v: txData.v !== undefined ? toBigInt(txData.v) : undefined,
    r: txData.r !== undefined ? toBigInt(txData.r) : undefined,
    s: txData.s !== undefined ? toBigInt(txData.s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for an EIP-4844 transaction from RLP-encoded bytes.
 */
export function createBlobTxManagerFromRLP(
  serialized: Uint8Array,
  opts: TxOptions,
): TxManager {
  // First byte is the type (0x03), rest is RLP-encoded
  const values = RLP.decode(serialized.subarray(1))

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized tx input. Must be array',
    )
  }

  const [
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    to,
    value,
    data,
    accessList,
    maxFeePerBlobGas,
    blobVersionedHashes,
    v,
    r,
    s,
  ] = values as Uint8Array[]

  validateNoLeadingZeroes({
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    value,
    maxFeePerBlobGas,
    v,
    r,
    s,
  })

  if (!to || to.length === 0) {
    throw EthereumJSErrorWithoutCode(
      'EIP-4844 blob transactions require a "to" address',
    )
  }

  // For typed transactions, v (y-parity) can be 0, which RLP encodes as empty array
  // We determine if tx is signed by checking if r and s exist (they can't be 0 for valid sigs)
  const hasSig = r && r.length > 0 && s && s.length > 0

  const inner = new BlobTxData({
    chainId: bytesToBigInt(chainId ?? new Uint8Array(0)),
    nonce: bytesToBigInt(nonce ?? new Uint8Array(0)),
    maxPriorityFeePerGas: bytesToBigInt(
      maxPriorityFeePerGas ?? new Uint8Array(0),
    ),
    maxFeePerGas: bytesToBigInt(maxFeePerGas ?? new Uint8Array(0)),
    gasLimit: bytesToBigInt(gasLimit ?? new Uint8Array(0)),
    to: bytesToAddress(to),
    value: bytesToBigInt(value ?? new Uint8Array(0)),
    data: data ?? new Uint8Array(0),
    accessList: (accessList ?? []) as unknown as AccessListBytes,
    maxFeePerBlobGas: bytesToBigInt(maxFeePerBlobGas ?? new Uint8Array(0)),
    blobVersionedHashes: (
      (blobVersionedHashes ?? []) as unknown as Uint8Array[]
    ).map((h) => bytesToHex(h) as PrefixedHexString),
    v: hasSig ? bytesToBigInt(v ?? new Uint8Array(0)) : undefined,
    r: hasSig ? bytesToBigInt(r) : undefined,
    s: hasSig ? bytesToBigInt(s) : undefined,
  })
  return newTx(inner, opts)
}

// ============================================================================
// Set Code (EIP-7702) Transaction Factory
// ============================================================================

/**
 * Create a TxManager for an EIP-7702 set code transaction.
 */
export function createSetCodeTxManager(
  txData: InputEOACode7702TxData,
  opts: TxOptions,
): TxManager {
  if (!txData.to) {
    throw EthereumJSErrorWithoutCode(
      'EIP-7702 set code transactions require a "to" address',
    )
  }

  // Convert authorization list to bytes format if needed
  const authList = txData.authorizationList ?? []

  const inner = new SetCodeTxData({
    chainId: toBigInt(txData.chainId ?? opts.common.chainId()),
    nonce: toBigInt(txData.nonce),
    maxPriorityFeePerGas: toBigInt(txData.maxPriorityFeePerGas),
    maxFeePerGas: toBigInt(txData.maxFeePerGas),
    gasLimit: toBigInt(txData.gasLimit),
    to: toAddress(txData.to)!,
    value: toBigInt(txData.value),
    data: toUint8Array(txData.data),
    accessList: toAccessListBytes(txData.accessList),
    authorizationList: authList as any, // Accept both formats
    v: txData.v !== undefined ? toBigInt(txData.v) : undefined,
    r: txData.r !== undefined ? toBigInt(txData.r) : undefined,
    s: txData.s !== undefined ? toBigInt(txData.s) : undefined,
  })
  return newTx(inner, opts)
}

/**
 * Create a TxManager for an EIP-7702 transaction from RLP-encoded bytes.
 */
export function createSetCodeTxManagerFromRLP(
  serialized: Uint8Array,
  opts: TxOptions,
): TxManager {
  // First byte is the type (0x04), rest is RLP-encoded
  const values = RLP.decode(serialized.subarray(1))

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized tx input. Must be array',
    )
  }

  const [
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    to,
    value,
    data,
    accessList,
    authorizationList,
    v,
    r,
    s,
  ] = values as Uint8Array[]

  validateNoLeadingZeroes({
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    value,
    v,
    r,
    s,
  })

  if (!to || to.length === 0) {
    throw EthereumJSErrorWithoutCode(
      'EIP-7702 set code transactions require a "to" address',
    )
  }

  // For typed transactions, v (y-parity) can be 0, which RLP encodes as empty array
  // We determine if tx is signed by checking if r and s exist (they can't be 0 for valid sigs)
  const hasSig = r && r.length > 0 && s && s.length > 0

  const inner = new SetCodeTxData({
    chainId: bytesToBigInt(chainId ?? new Uint8Array(0)),
    nonce: bytesToBigInt(nonce ?? new Uint8Array(0)),
    maxPriorityFeePerGas: bytesToBigInt(
      maxPriorityFeePerGas ?? new Uint8Array(0),
    ),
    maxFeePerGas: bytesToBigInt(maxFeePerGas ?? new Uint8Array(0)),
    gasLimit: bytesToBigInt(gasLimit ?? new Uint8Array(0)),
    to: bytesToAddress(to),
    value: bytesToBigInt(value ?? new Uint8Array(0)),
    data: data ?? new Uint8Array(0),
    accessList: (accessList ?? []) as unknown as AccessListBytes,
    authorizationList: (authorizationList ?? []) as any,
    v: hasSig ? bytesToBigInt(v ?? new Uint8Array(0)) : undefined,
    r: hasSig ? bytesToBigInt(r) : undefined,
    s: hasSig ? bytesToBigInt(s) : undefined,
  })
  return newTx(inner, opts)
}

// ============================================================================
// Generic Factory Functions
// ============================================================================

/**
 * Create a TxManager from transaction data.
 * Equivalent to the old `createTx` function but returns TxManager.
 *
 * @param txData - The transaction data. The `type` field determines the transaction type.
 * @param txOptions - Options for the transaction
 */
export function createTxManager(
  txData: TypedTxData,
  txOptions: TxOptions,
): TxManager {
  if (!('type' in txData) || txData.type === undefined) {
    // Assume legacy transaction
    return createLegacyTxManager(txData, txOptions)
  }

  if (isLegacyTxData(txData)) {
    return createLegacyTxManager(txData, txOptions)
  } else if (isAccessList2930TxData(txData)) {
    return createAccessListTxManager(txData, txOptions)
  } else if (isFeeMarket1559TxData(txData)) {
    return createDynamicFeeTxManager(txData, txOptions)
  } else if (isBlob4844TxData(txData)) {
    return createBlobTxManager(txData, txOptions)
  } else if (isEOACode7702TxData(txData)) {
    return createSetCodeTxManager(txData, txOptions)
  } else {
    throw EthereumJSErrorWithoutCode(
      `Tx instantiation with type ${(txData as TypedTxData)?.type} not supported`,
    )
  }
}

/**
 * Create a TxManager from RLP-encoded transaction data.
 * Equivalent to the old `createTxFromRLP` function but returns TxManager.
 *
 * @param data - The RLP-encoded transaction bytes
 * @param txOptions - Options for the transaction
 */
export function createTxManagerFromRLP(
  data: Uint8Array,
  txOptions: TxOptions,
): TxManager {
  if (data[0] <= 0x7f) {
    // Typed transaction
    switch (data[0]) {
      case TransactionType.AccessListEIP2930:
        return createAccessListTxManagerFromRLP(data, txOptions)
      case TransactionType.FeeMarketEIP1559:
        return createDynamicFeeTxManagerFromRLP(data, txOptions)
      case TransactionType.BlobEIP4844:
        return createBlobTxManagerFromRLP(data, txOptions)
      case TransactionType.EOACodeEIP7702:
        return createSetCodeTxManagerFromRLP(data, txOptions)
      default:
        throw EthereumJSErrorWithoutCode(
          `TypedTransaction with ID ${data[0]} unknown`,
        )
    }
  } else {
    // Legacy transaction
    return createLegacyTxManagerFromRLP(data, txOptions)
  }
}

/**
 * Create a TxManager from block body data.
 * Equivalent to the old `createTxFromBlockBodyData` function but returns TxManager.
 *
 * @param data - Either a Uint8Array (typed tx) or Uint8Array[] (legacy tx)
 * @param txOptions - Options for the transaction
 */
export function createTxManagerFromBlockBodyData(
  data: Uint8Array | Uint8Array[],
  txOptions: TxOptions,
): TxManager {
  if (data instanceof Uint8Array) {
    return createTxManagerFromRLP(data, txOptions)
  } else if (Array.isArray(data)) {
    // Legacy transaction
    return createLegacyTxManagerFromBytesArray(data, txOptions)
  } else {
    throw EthereumJSErrorWithoutCode(
      'Cannot decode transaction: unknown type input',
    )
  }
}

/**
 * Create a TxManager from RPC data.
 * Equivalent to the old `createTxFromRPC` function but returns TxManager.
 */
export async function createTxManagerFromRPC(
  txData: TypedTxData,
  txOptions: TxOptions,
): Promise<TxManager> {
  return createTxManager(normalizeTxParams(txData), txOptions)
}

/**
 * Create a TxManager from a JSON-RPC provider.
 * Equivalent to the old `createTxFromJSONRPCProvider` function but returns TxManager.
 */
export async function createTxManagerFromJSONRPCProvider(
  provider: string | EthersProvider,
  txHash: string,
  txOptions?: TxOptions,
): Promise<TxManager> {
  const prov = getProvider(provider)
  const txData = await fetchFromProvider(prov, {
    method: 'eth_getTransactionByHash',
    params: [txHash],
  })
  if (txData === null) {
    throw EthereumJSErrorWithoutCode('No data returned from provider')
  }
  if (!txOptions) {
    throw EthereumJSErrorWithoutCode('txOptions is required')
  }
  return createTxManagerFromRPC(txData, txOptions)
}
