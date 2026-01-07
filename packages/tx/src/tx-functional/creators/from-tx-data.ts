import {
  Address,
  bytesToBigInt,
  deepFreeze,
  type TypedTxData,
  toBytes,
} from '@ts-ethereum/utils'
import type {
  AccessListBytes,
  EOACode7702AuthorizationListBytes,
  TransactionType,
} from '../../types'
import {
  isAccessList2930TxData,
  isBlob4844TxData,
  isEOACode7702TxData,
  isFeeMarket1559TxData,
  isLegacyTxData,
  TransactionType as TxType,
} from '../../types'
import { accessListJSONToBytes } from '../../util/access'
import { AccessListTxData } from '../tx-data/access-list'
import { BlobTxData } from '../tx-data/blob'
import { DynamicFeeTxData } from '../tx-data/dynamic-fee'
import { EOACodeTxData } from '../tx-data/eoa-code'
import { LegacyTxData } from '../tx-data/legacy'
import type { CreateTxOptions, FrozenTransaction } from '../types'

/**
 * Creates a FrozenTransaction from transaction data.
 * This is the main factory function for creating transactions.
 */
export function fromTxData(
  txData: TypedTxData,
  opts: CreateTxOptions,
): FrozenTransaction {
  // Determine transaction type
  const txType =
    txData.type !== undefined
      ? Number(bytesToBigInt(toBytes(txData.type)))
      : TxType.Legacy

  // Create the appropriate TxData instance
  let inner:
    | LegacyTxData
    | AccessListTxData
    | DynamicFeeTxData
    | BlobTxData
    | EOACodeTxData

  if (txType === TxType.Legacy || isLegacyTxData(txData)) {
    inner = createLegacyTxData(txData)
  } else if (
    txType === TxType.AccessListEIP2930 ||
    isAccessList2930TxData(txData)
  ) {
    inner = createAccessListTxData(txData, opts)
  } else if (
    txType === TxType.FeeMarketEIP1559 ||
    isFeeMarket1559TxData(txData)
  ) {
    inner = createDynamicFeeTxData(txData, opts)
  } else if (txType === TxType.BlobEIP4844 || isBlob4844TxData(txData)) {
    inner = createBlobTxData(txData, opts)
  } else if (txType === TxType.EOACodeEIP7702 || isEOACode7702TxData(txData)) {
    inner = createEOACodeTxData(txData, opts)
  } else {
    throw new Error(`Unsupported transaction type: ${txType}`)
  }

  // Create FrozenTransaction
  const transaction: FrozenTransaction = {
    inner,
    hardforkManager: opts.hardforkManager,
    _cache: {},
  }

  // Freeze if requested
  if (opts.freeze !== false) {
    return deepFreeze(transaction)
  }

  return transaction
}

function createLegacyTxData(txData: TypedTxData): LegacyTxData {
  const nonce = bytesToBigInt(toBytes(txData.nonce ?? 0))
  const gasPrice = bytesToBigInt(toBytes(txData.gasPrice ?? 0))
  const gasLimit = bytesToBigInt(toBytes(txData.gasLimit ?? 0))
  const toBytes_ = toBytes(txData.to ?? '0x')
  const to = toBytes_.length > 0 ? new Address(toBytes_) : undefined
  const value = bytesToBigInt(toBytes(txData.value ?? 0))
  const data = toBytes(txData.data ?? '0x')
  const v =
    txData.v !== undefined ? bytesToBigInt(toBytes(txData.v)) : undefined
  const r =
    txData.r !== undefined ? bytesToBigInt(toBytes(txData.r)) : undefined
  const s =
    txData.s !== undefined ? bytesToBigInt(toBytes(txData.s)) : undefined

  return new LegacyTxData(nonce, gasPrice, gasLimit, to, value, data, v, r, s)
}

function createAccessListTxData(
  txData: TypedTxData,
  opts: CreateTxOptions,
): AccessListTxData {
  const chainId = opts.hardforkManager.chainId()
  const nonce = bytesToBigInt(toBytes(txData.nonce ?? 0))
  const gasPrice = bytesToBigInt(toBytes(txData.gasPrice ?? 0))
  const gasLimit = bytesToBigInt(toBytes(txData.gasLimit ?? 0))
  const toBytes_ = toBytes(txData.to ?? '0x')
  const to = toBytes_.length > 0 ? new Address(toBytes_) : undefined
  const value = bytesToBigInt(toBytes(txData.value ?? 0))
  const data = toBytes(txData.data ?? '0x')
  const accessList =
    txData.accessList !== undefined && txData.accessList !== null
      ? Array.isArray(txData.accessList[0])
        ? (txData.accessList as AccessListBytes)
        : accessListJSONToBytes(txData.accessList)
      : []
  const v =
    txData.v !== undefined ? bytesToBigInt(toBytes(txData.v)) : undefined
  const r =
    txData.r !== undefined ? bytesToBigInt(toBytes(txData.r)) : undefined
  const s =
    txData.s !== undefined ? bytesToBigInt(toBytes(txData.s)) : undefined

  return new AccessListTxData(
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
  )
}

function createDynamicFeeTxData(
  txData: TypedTxData,
  opts: CreateTxOptions,
): DynamicFeeTxData {
  const chainId = opts.hardforkManager.chainId()
  const nonce = bytesToBigInt(toBytes(txData.nonce ?? 0))
  const maxPriorityFeePerGas = bytesToBigInt(
    toBytes(txData.maxPriorityFeePerGas ?? 0),
  )
  const maxFeePerGas = bytesToBigInt(toBytes(txData.maxFeePerGas ?? 0))
  const gasLimit = bytesToBigInt(toBytes(txData.gasLimit ?? 0))
  const toBytes_ = toBytes(txData.to ?? '0x')
  const to = toBytes_.length > 0 ? new Address(toBytes_) : undefined
  const value = bytesToBigInt(toBytes(txData.value ?? 0))
  const data = toBytes(txData.data ?? '0x')
  const accessList =
    txData.accessList !== undefined && txData.accessList !== null
      ? Array.isArray(txData.accessList[0])
        ? (txData.accessList as AccessListBytes)
        : accessListJSONToBytes(txData.accessList)
      : []
  const v =
    txData.v !== undefined ? bytesToBigInt(toBytes(txData.v)) : undefined
  const r =
    txData.r !== undefined ? bytesToBigInt(toBytes(txData.r)) : undefined
  const s =
    txData.s !== undefined ? bytesToBigInt(toBytes(txData.s)) : undefined

  return new DynamicFeeTxData(
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
  )
}

function createBlobTxData(
  txData: TypedTxData,
  opts: CreateTxOptions,
): BlobTxData {
  const chainId = opts.hardforkManager.chainId()
  const nonce = bytesToBigInt(toBytes(txData.nonce ?? 0))
  const maxPriorityFeePerGas = bytesToBigInt(
    toBytes(txData.maxPriorityFeePerGas ?? 0),
  )
  const maxFeePerGas = bytesToBigInt(toBytes(txData.maxFeePerGas ?? 0))
  const gasLimit = bytesToBigInt(toBytes(txData.gasLimit ?? 0))
  const toBytes_ = toBytes(txData.to ?? '0x')
  const to = toBytes_.length > 0 ? new Address(toBytes_) : undefined
  const value = bytesToBigInt(toBytes(txData.value ?? 0))
  const data = toBytes(txData.data ?? '0x')
  const accessList =
    txData.accessList !== undefined && txData.accessList !== null
      ? Array.isArray(txData.accessList[0])
        ? (txData.accessList as AccessListBytes)
        : accessListJSONToBytes(txData.accessList)
      : []
  const maxFeePerBlobGas = bytesToBigInt(toBytes(txData.maxFeePerBlobGas ?? 0))
  const blobVersionedHashes =
    txData.blobVersionedHashes !== undefined
      ? txData.blobVersionedHashes.map((hash) => toBytes(hash))
      : []
  const v =
    txData.v !== undefined ? bytesToBigInt(toBytes(txData.v)) : undefined
  const r =
    txData.r !== undefined ? bytesToBigInt(toBytes(txData.r)) : undefined
  const s =
    txData.s !== undefined ? bytesToBigInt(toBytes(txData.s)) : undefined

  return new BlobTxData(
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
  )
}

function createEOACodeTxData(
  txData: TypedTxData,
  opts: CreateTxOptions,
): EOACodeTxData {
  const chainId = opts.hardforkManager.chainId()
  const nonce = bytesToBigInt(toBytes(txData.nonce ?? 0))
  const maxPriorityFeePerGas = bytesToBigInt(
    toBytes(txData.maxPriorityFeePerGas ?? 0),
  )
  const maxFeePerGas = bytesToBigInt(toBytes(txData.maxFeePerGas ?? 0))
  const gasLimit = bytesToBigInt(toBytes(txData.gasLimit ?? 0))
  const toBytes_ = toBytes(txData.to ?? '0x')
  const to = toBytes_.length > 0 ? new Address(toBytes_) : undefined
  const value = bytesToBigInt(toBytes(txData.value ?? 0))
  const data = toBytes(txData.data ?? '0x')
  const accessList =
    txData.accessList !== undefined && txData.accessList !== null
      ? Array.isArray(txData.accessList[0])
        ? (txData.accessList as AccessListBytes)
        : accessListJSONToBytes(txData.accessList)
      : []
  const authorizationList =
    txData.authorizationList !== undefined
      ? (txData.authorizationList as EOACode7702AuthorizationListBytes)
      : []
  const v =
    txData.v !== undefined ? bytesToBigInt(toBytes(txData.v)) : undefined
  const r =
    txData.r !== undefined ? bytesToBigInt(toBytes(txData.r)) : undefined
  const s =
    txData.s !== undefined ? bytesToBigInt(toBytes(txData.s)) : undefined

  return new EOACodeTxData(
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
  )
}
