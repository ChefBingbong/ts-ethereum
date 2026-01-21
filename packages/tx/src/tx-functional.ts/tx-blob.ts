import { type Input, RLP } from '@ts-ethereum/rlp'
import type { Address, PrefixedHexString } from '@ts-ethereum/utils'
import {
  bigIntToUnpaddedBytes,
  concatBytes,
  hexToBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { AccessListBytes } from '../types'
import { TransactionType } from '../types'
import type { TxData } from './types'

/**
 * BlobTxSidecar contains the blobs of a blob transaction.
 * Equivalent to Go's BlobTxSidecar struct.
 */
export interface BlobTxSidecar {
  version: number // 0 = EIP-4844, 1 = EIP-7594
  blobs: PrefixedHexString[]
  commitments: PrefixedHexString[]
  proofs: PrefixedHexString[]
}

/**
 * BlobTxData implements TxData for EIP-4844 blob transactions.
 * Equivalent to Go's BlobTx struct.
 *
 * Transaction type: 3
 * EIP: https://eips.ethereum.org/EIPS/eip-4844
 */
export class BlobTxData implements TxData {
  readonly type = TransactionType.BlobEIP4844
  readonly chainId: bigint
  readonly nonce: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly maxFeePerGas: bigint
  readonly gasLimit: bigint
  readonly to: Address // Required for blob txs (cannot create contracts)
  readonly value: bigint
  readonly data: Uint8Array
  readonly _accessList: AccessListBytes
  readonly maxFeePerBlobGas: bigint
  readonly blobVersionedHashes: PrefixedHexString[]
  readonly sidecar?: BlobTxSidecar
  readonly v?: bigint
  readonly r?: bigint
  readonly s?: bigint

  constructor(data: {
    chainId: bigint
    nonce: bigint
    maxPriorityFeePerGas: bigint
    maxFeePerGas: bigint
    gasLimit: bigint
    to: Address
    value: bigint
    data: Uint8Array
    accessList?: AccessListBytes
    maxFeePerBlobGas: bigint
    blobVersionedHashes: PrefixedHexString[]
    sidecar?: BlobTxSidecar
    v?: bigint
    r?: bigint
    s?: bigint
  }) {
    this.chainId = data.chainId
    this.nonce = data.nonce
    this.maxPriorityFeePerGas = data.maxPriorityFeePerGas
    this.maxFeePerGas = data.maxFeePerGas
    this.gasLimit = data.gasLimit
    this.to = data.to
    this.value = data.value
    this.data = data.data
    this._accessList = data.accessList ?? []
    this.maxFeePerBlobGas = data.maxFeePerBlobGas
    this.blobVersionedHashes = data.blobVersionedHashes
    this.sidecar = data.sidecar
    this.v = data.v
    this.r = data.r
    this.s = data.s
  }

  copy(): TxData {
    return new BlobTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: new Uint8Array(this.data),
      accessList: this._accessList.map(([addr, keys]) => [
        new Uint8Array(addr),
        keys.map((k) => new Uint8Array(k)),
      ]),
      maxFeePerBlobGas: this.maxFeePerBlobGas,
      blobVersionedHashes: [...this.blobVersionedHashes],
      sidecar: this.sidecar
        ? {
            version: this.sidecar.version,
            blobs: [...this.sidecar.blobs],
            commitments: [...this.sidecar.commitments],
            proofs: [...this.sidecar.proofs],
          }
        : undefined,
      v: this.v,
      r: this.r,
      s: this.s,
    })
  }

  chainID(): bigint {
    return this.chainId
  }

  accessList(): AccessListBytes {
    return this._accessList
  }

  /**
   * Returns the max fee per gas (gasFeeCap).
   * For blob txs, gasPrice() returns the fee cap like Go does.
   */
  gasPrice(): bigint {
    return this.maxFeePerGas
  }

  gasTipCap(): bigint {
    return this.maxPriorityFeePerGas
  }

  gasFeeCap(): bigint {
    return this.maxFeePerGas
  }

  rawSignatureValues(): [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
  ] {
    return [this.v, this.r, this.s]
  }

  setSignatureValues(
    _chainID: bigint,
    v: bigint,
    r: bigint,
    s: bigint,
  ): TxData {
    return new BlobTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: this.data,
      accessList: this._accessList,
      maxFeePerBlobGas: this.maxFeePerBlobGas,
      blobVersionedHashes: this.blobVersionedHashes,
      sidecar: this.sidecar,
      v,
      r,
      s,
    })
  }

  /**
   * Computes the gas price paid by the transaction, given the inclusion block baseFee.
   * Equivalent to Go's effectiveGasPrice method.
   */
  effectiveGasPrice(baseFee?: bigint): bigint {
    if (baseFee === undefined) {
      return this.maxFeePerGas
    }
    let tip = this.maxFeePerGas - baseFee
    if (tip > this.maxPriorityFeePerGas) {
      tip = this.maxPriorityFeePerGas
    }
    return tip + baseFee
  }

  /**
   * Returns the number of blobs in this transaction.
   */
  blobGas(): bigint {
    // Each blob uses a fixed amount of gas (131072 = 128 * 1024)
    const BLOB_TX_BLOB_GAS_PER_BLOB = 131072n
    return BLOB_TX_BLOB_GAS_PER_BLOB * BigInt(this.blobVersionedHashes.length)
  }

  /**
   * Returns the unsigned transaction fields to be hashed for signing.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes]
   */
  getMessageToSign(): Input[] {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.maxPriorityFeePerGas),
      bigIntToUnpaddedBytes(this.maxFeePerGas),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to.bytes,
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this._accessList as Input,
      bigIntToUnpaddedBytes(this.maxFeePerBlobGas),
      this.blobVersionedHashes.map((hash) => hexToBytes(hash)) as Input,
    ]
  }

  /**
   * Returns the hash of the unsigned transaction for signing.
   * For EIP-4844: keccak256(0x03 || rlp([chainId, nonce, ...]))
   */
  sigHash(_chainId: bigint): Uint8Array {
    const message = this.getMessageToSign()
    const encoded = RLP.encode(message)
    return keccak256(concatBytes(new Uint8Array([this.type]), encoded))
  }

  /**
   * Returns the raw RLP-encodable array of the transaction including signature.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes, v, r, s]
   */
  raw(): Input[] {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.maxPriorityFeePerGas),
      bigIntToUnpaddedBytes(this.maxFeePerGas),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to.bytes,
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this._accessList as Input,
      bigIntToUnpaddedBytes(this.maxFeePerBlobGas),
      this.blobVersionedHashes.map((hash) => hexToBytes(hash)) as Input,
      this.v !== undefined ? bigIntToUnpaddedBytes(this.v) : new Uint8Array(0),
      this.r !== undefined ? bigIntToUnpaddedBytes(this.r) : new Uint8Array(0),
      this.s !== undefined ? bigIntToUnpaddedBytes(this.s) : new Uint8Array(0),
    ]
  }

  /**
   * Returns a copy of this transaction without the sidecar.
   */
  withoutSidecar(): BlobTxData {
    return new BlobTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: this.data,
      accessList: this._accessList,
      maxFeePerBlobGas: this.maxFeePerBlobGas,
      blobVersionedHashes: this.blobVersionedHashes,
      sidecar: undefined,
      v: this.v,
      r: this.r,
      s: this.s,
    })
  }

  /**
   * Returns a copy of this transaction with the given sidecar.
   */
  withSidecar(sidecar: BlobTxSidecar): BlobTxData {
    return new BlobTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: this.data,
      accessList: this._accessList,
      maxFeePerBlobGas: this.maxFeePerBlobGas,
      blobVersionedHashes: this.blobVersionedHashes,
      sidecar,
      v: this.v,
      r: this.r,
      s: this.s,
    })
  }
}
