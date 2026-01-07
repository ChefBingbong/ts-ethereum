import { RLP } from '@ts-ethereum/rlp'
import {
  bigIntToUnpaddedBytes,
  EthereumJSErrorWithoutCode,
  intToBytes,
  unpadBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { Address } from '@ts-ethereum/utils'
import type { AccessListBytes } from '../../types'
import { TransactionType as TxType } from '../../types'
import type { TxData } from '../types'

/**
 * Access List transaction data (EIP-2930).
 * Implements the TxData interface for access list transactions.
 */
export class AccessListTxData implements TxData {
  readonly chainId: bigint
  readonly nonce: bigint
  readonly gasPrice: bigint
  readonly _gas: bigint
  readonly to?: Address
  readonly value: bigint
  readonly _data: Uint8Array
  readonly accessList: AccessListBytes
  v?: bigint
  r?: bigint
  s?: bigint

  constructor(
    chainId: bigint,
    nonce: bigint,
    gasPrice: bigint,
    gas: bigint,
    to: Address | undefined,
    value: bigint,
    data: Uint8Array,
    accessList: AccessListBytes,
    v?: bigint,
    r?: bigint,
    s?: bigint,
  ) {
    this.chainId = chainId
    this.nonce = nonce
    this.gasPrice = gasPrice
    this._gas = gas
    this.to = to
    this.value = value
    this._data = data
    this.accessList = accessList
    this.v = v
    this.r = r
    this.s = s
  }

  txType(): number {
    return TxType.AccessListEIP2930
  }

  copy(): TxData {
    return new AccessListTxData(
      this.chainId,
      this.nonce,
      this.gasPrice,
      this._gas,
      this.to,
      this.value,
      new Uint8Array(this._data),
      this.accessList.map((item) => [
        new Uint8Array(item[0]),
        item[1].map((slot) => new Uint8Array(slot)),
      ]),
      this.v,
      this.r,
      this.s,
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
    return this.gasPrice
  }

  gasTipCap(): bigint {
    return this.gasPrice
  }

  gasFeeCap(): bigint {
    return this.gasPrice
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
    return this.gasPrice
  }

  sigHash(chainID: bigint | undefined): Uint8Array {
    const message = [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasPrice),
      bigIntToUnpaddedBytes(this._gas),
      this.to !== undefined ? this.to.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this._data,
      this.accessList,
    ]

    // EIP-2718: typed transaction envelope
    const typedMessage = [TxType.AccessListEIP2930, RLP.encode(message)]
    return keccak256(RLP.encode(typedMessage))
  }
}

