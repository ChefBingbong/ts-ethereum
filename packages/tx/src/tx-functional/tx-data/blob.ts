import { RLP } from '@ts-ethereum/rlp'
import {
  bigIntMax,
  bigIntMin,
  bigIntToUnpaddedBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { Address, PrefixedHexString } from '@ts-ethereum/utils'
import type { AccessListBytes } from '../../types'
import { TransactionType as TxType } from '../../types'
import type { TxData } from '../types'

/**
 * Blob transaction data (EIP-4844).
 * Implements the TxData interface for blob transactions.
 */
export class BlobTxData implements TxData {
  readonly chainId: bigint
  readonly nonce: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly maxFeePerGas: bigint
  readonly _gas: bigint
  readonly to?: Address
  readonly value: bigint
  readonly _data: Uint8Array
  readonly accessList: AccessListBytes
  readonly maxFeePerBlobGas: bigint
  readonly blobVersionedHashes: Uint8Array[]
  v?: bigint
  r?: bigint
  s?: bigint

  // Network wrapper fields (optional)
  readonly blobs?: Uint8Array[]
  readonly kzgCommitments?: Uint8Array[]
  readonly kzgProofs?: Uint8Array[]
  readonly networkWrapperVersion?: number

  constructor(
    chainId: bigint,
    nonce: bigint,
    maxPriorityFeePerGas: bigint,
    maxFeePerGas: bigint,
    gas: bigint,
    to: Address | undefined,
    value: bigint,
    data: Uint8Array,
    accessList: AccessListBytes,
    maxFeePerBlobGas: bigint,
    blobVersionedHashes: Uint8Array[],
    v?: bigint,
    r?: bigint,
    s?: bigint,
    blobs?: Uint8Array[],
    kzgCommitments?: Uint8Array[],
    kzgProofs?: Uint8Array[],
    networkWrapperVersion?: number,
  ) {
    this.chainId = chainId
    this.nonce = nonce
    this.maxPriorityFeePerGas = maxPriorityFeePerGas
    this.maxFeePerGas = maxFeePerGas
    this._gas = gas
    this.to = to
    this.value = value
    this._data = data
    this.accessList = accessList
    this.maxFeePerBlobGas = maxFeePerBlobGas
    this.blobVersionedHashes = blobVersionedHashes
    this.v = v
    this.r = r
    this.s = s
    this.blobs = blobs
    this.kzgCommitments = kzgCommitments
    this.kzgProofs = kzgProofs
    this.networkWrapperVersion = networkWrapperVersion
  }

  txType(): number {
    return TxType.BlobEIP4844
  }

  copy(): TxData {
    return new BlobTxData(
      this.chainId,
      this.nonce,
      this.maxPriorityFeePerGas,
      this.maxFeePerGas,
      this._gas,
      this.to,
      this.value,
      new Uint8Array(this._data),
      this.accessList.map((item) => [
        new Uint8Array(item[0]),
        item[1].map((slot) => new Uint8Array(slot)),
      ]),
      this.maxFeePerBlobGas,
      this.blobVersionedHashes.map((hash) => new Uint8Array(hash)),
      this.v,
      this.r,
      this.s,
      this.blobs?.map((blob) => new Uint8Array(blob)),
      this.kzgCommitments?.map((commit) => new Uint8Array(commit)),
      this.kzgProofs?.map((proof) => new Uint8Array(proof)),
      this.networkWrapperVersion,
    )
  }

  chainId(): bigint | undefined {
    return this.chainId
  }

  accessList(): AccessListBytes {
    return this.accessList
  }

  data(): Uint8Array {
    return this._data
  }

  gas(): bigint {
    return this._gas
  }

  gasPrice(): bigint {
    return this.maxFeePerGas
  }

  gasTipCap(): bigint {
    return this.maxPriorityFeePerGas
  }

  gasFeeCap(): bigint {
    return this.maxFeePerGas
  }

  value(): bigint {
    return this.value
  }

  nonce(): bigint {
    return this.nonce
  }

  to(): Address | undefined {
    return this.to
  }

  rawSignatureValues(): { v?: bigint; r?: bigint; s?: bigint } {
    return { v: this.v, r: this.r, s: this.s }
  }

  setSignatureValues(
    chainID: bigint | undefined,
    v: bigint,
    r: bigint,
    s: bigint,
  ): void {
    this.v = v
    this.r = r
    this.s = s
  }

  effectiveGasPrice(baseFee: bigint | undefined): bigint {
    if (baseFee === undefined) {
      return this.maxFeePerGas
    }

    // effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
    const tip = bigIntMin(
      this.maxFeePerGas - baseFee,
      this.maxPriorityFeePerGas,
    )
    return baseFee + tip
  }

  sigHash(chainID: bigint | undefined): Uint8Array {
    const message = [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.maxPriorityFeePerGas),
      bigIntToUnpaddedBytes(this.maxFeePerGas),
      bigIntToUnpaddedBytes(this._gas),
      this.to !== undefined ? this.to.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this._data,
      this.accessList,
      bigIntToUnpaddedBytes(this.maxFeePerBlobGas),
      this.blobVersionedHashes,
    ]

    // EIP-2718: typed transaction envelope
    const typedMessage = [TxType.BlobEIP4844, RLP.encode(message)]
    return keccak256(RLP.encode(typedMessage))
  }
}

