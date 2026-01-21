import { type Input, RLP } from '@ts-ethereum/rlp'
import type { Address } from '@ts-ethereum/utils'
import { bigIntToUnpaddedBytes, concatBytes } from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { AccessListBytes } from '../types'
import { TransactionType } from '../types'
import type { TxData } from './types'

/**
 * DynamicFeeTxData implements TxData for EIP-1559 dynamic fee transactions.
 * Equivalent to Go's DynamicFeeTx struct.
 *
 * Transaction type: 2
 * EIP: https://eips.ethereum.org/EIPS/eip-1559
 */
export class DynamicFeeTxData implements TxData {
  readonly type = TransactionType.FeeMarketEIP1559
  readonly chainId: bigint
  readonly nonce: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly maxFeePerGas: bigint
  readonly gasLimit: bigint
  readonly to?: Address
  readonly value: bigint
  readonly data: Uint8Array
  readonly _accessList: AccessListBytes
  readonly v?: bigint
  readonly r?: bigint
  readonly s?: bigint

  constructor(data: {
    chainId: bigint
    nonce: bigint
    maxPriorityFeePerGas: bigint
    maxFeePerGas: bigint
    gasLimit: bigint
    to?: Address
    value: bigint
    data: Uint8Array
    accessList?: AccessListBytes
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
    this.v = data.v
    this.r = data.r
    this.s = data.s
  }

  copy(): TxData {
    return new DynamicFeeTxData({
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
   * For EIP-1559, gasPrice() returns the fee cap like Go does.
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
    return new DynamicFeeTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: this.data,
      accessList: this._accessList,
      v,
      r,
      s,
    })
  }

  /**
   * Computes the gas price paid by the transaction, given the inclusion block baseFee.
   * Equivalent to Go's effectiveGasPrice method.
   *
   * effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
   */
  effectiveGasPrice(baseFee?: bigint): bigint {
    if (baseFee === undefined) {
      return this.maxFeePerGas
    }
    // tip = maxFeePerGas - baseFee
    let tip = this.maxFeePerGas - baseFee
    // if tip > maxPriorityFeePerGas, cap it
    if (tip > this.maxPriorityFeePerGas) {
      tip = this.maxPriorityFeePerGas
    }
    // effective price = tip + baseFee
    return tip + baseFee
  }

  /**
   * Returns the unsigned transaction fields to be hashed for signing.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList]
   */
  getMessageToSign(): Input[] {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.maxPriorityFeePerGas),
      bigIntToUnpaddedBytes(this.maxFeePerGas),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.bytes ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this._accessList as Input,
    ]
  }

  /**
   * Returns the hash of the unsigned transaction for signing.
   * For EIP-1559: keccak256(0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList]))
   */
  sigHash(_chainId: bigint): Uint8Array {
    const message = this.getMessageToSign()
    const encoded = RLP.encode(message)
    // Prepend type byte (0x02) for EIP-2718 typed transaction
    return keccak256(concatBytes(new Uint8Array([this.type]), encoded))
  }

  /**
   * Returns the raw RLP-encodable array of the transaction including signature.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, v, r, s]
   */
  raw(): Input[] {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.maxPriorityFeePerGas),
      bigIntToUnpaddedBytes(this.maxFeePerGas),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.bytes ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this._accessList as Input,
      this.v !== undefined ? bigIntToUnpaddedBytes(this.v) : new Uint8Array(0),
      this.r !== undefined ? bigIntToUnpaddedBytes(this.r) : new Uint8Array(0),
      this.s !== undefined ? bigIntToUnpaddedBytes(this.s) : new Uint8Array(0),
    ]
  }
}
