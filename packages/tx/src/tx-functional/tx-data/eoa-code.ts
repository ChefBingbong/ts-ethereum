import { RLP } from '@ts-ethereum/rlp'
import type {
  Address,
  EOACode7702AuthorizationListBytes,
} from '@ts-ethereum/utils'
import { bigIntMin, bigIntToUnpaddedBytes } from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { AccessListBytes } from '../../types'
import { TransactionType as TxType } from '../../types'
import type { TxData } from '../types'

/**
 * EOA Code transaction data (EIP-7702).
 * Implements the TxData interface for EIP-7702 transactions.
 */
export class EOACodeTxData implements TxData {
  readonly chainId: bigint
  readonly nonce: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly maxFeePerGas: bigint
  readonly _gas: bigint
  readonly to?: Address
  readonly value: bigint
  readonly _data: Uint8Array
  readonly accessList: AccessListBytes
  readonly authorizationList: EOACode7702AuthorizationListBytes
  v?: bigint
  r?: bigint
  s?: bigint

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
    authorizationList: EOACode7702AuthorizationListBytes,
    v?: bigint,
    r?: bigint,
    s?: bigint,
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
    this.authorizationList = authorizationList
    this.v = v
    this.r = r
    this.s = s
  }

  txType(): number {
    return TxType.EOACodeEIP7702
  }

  copy(): TxData {
    return new EOACodeTxData(
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
      this.authorizationList.map((auth) => [
        new Uint8Array(auth[0]),
        new Uint8Array(auth[1]),
        auth[2] !== undefined ? new Uint8Array(auth[2]) : undefined,
        auth[3] !== undefined ? new Uint8Array(auth[3]) : undefined,
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
      this.authorizationList,
    ]

    // EIP-2718: typed transaction envelope
    const typedMessage = [TxType.EOACodeEIP7702, RLP.encode(message)]
    return keccak256(RLP.encode(typedMessage))
  }
}
