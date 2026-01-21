import { RLP } from '@ts-ethereum/rlp'
import type { Address } from '@ts-ethereum/utils'
import {
  bigIntToUnpaddedBytes,
  intToBytes,
  unpadBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { TransactionType } from '../types'
import type { TxData } from './types'

export class LegacyTxData implements TxData {
  readonly type = TransactionType.Legacy
  readonly nonce: bigint
  readonly _gasPrice: bigint
  readonly gasLimit: bigint
  readonly to?: Address
  readonly value: bigint
  readonly data: Uint8Array
  readonly v?: bigint
  readonly r?: bigint
  readonly s?: bigint

  constructor(data: {
    nonce: bigint
    gasPrice: bigint
    gasLimit: bigint
    to?: Address
    value: bigint
    data: Uint8Array
    v?: bigint
    r?: bigint
    s?: bigint
  }) {
    this.nonce = data.nonce
    this._gasPrice = data.gasPrice
    this.gasLimit = data.gasLimit
    this.to = data.to
    this.value = data.value
    this.data = data.data
    this.v = data.v
    this.r = data.r
    this.s = data.s
  }

  copy(): TxData {
    return new LegacyTxData({
      nonce: this.nonce,
      gasPrice: this._gasPrice,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: new Uint8Array(this.data),
      v: this.v,
      r: this.r,
      s: this.s,
    })
  }

  chainID(): bigint {
    // Derive from v if EIP-155 protected
    if (this.v && this.v >= 37n) {
      return (this.v - 35n) / 2n
    }
    return 0n
  }

  accessList(): null {
    return null
  }

  gasPrice(): bigint {
    return this._gasPrice
  }

  gasTipCap(): bigint {
    return this._gasPrice
  }

  gasFeeCap(): bigint {
    return this._gasPrice
  }

  rawSignatureValues(): [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
  ] {
    return [this.v, this.r, this.s]
  }

  setSignatureValues(chainID: bigint, v: bigint, r: bigint, s: bigint): TxData {
    return new LegacyTxData({
      ...this,
      gasPrice: this._gasPrice,
      v,
      r,
      s,
    })
  }

  effectiveGasPrice(baseFee?: bigint): bigint {
    return this._gasPrice
  }

  /**
   * Returns the unsigned transaction fields to be hashed for signing.
   * For pre-EIP155: [nonce, gasPrice, gasLimit, to, value, data]
   * For EIP-155: [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
   *
   * @param chainId - The chain ID to include if supportsEIP155 is true
   * @param supportsEIP155 - Whether to include chainId for replay protection
   */
  getMessageToSign(chainId: bigint, supportsEIP155: boolean): Uint8Array[] {
    const message: Uint8Array[] = [
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this._gasPrice),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.bytes ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
    ]

    if (supportsEIP155) {
      message.push(bigIntToUnpaddedBytes(chainId))
      message.push(unpadBytes(intToBytes(0)))
      message.push(unpadBytes(intToBytes(0)))
    }

    return message
  }

  /**
   * Returns the hash of the unsigned transaction for signing.
   * This is the hash that gets signed by the private key.
   *
   * Note: For legacy transactions, the chainId parameter determines
   * whether EIP-155 replay protection is used. If chainId > 0,
   * the hash includes [chainId, 0, 0] per EIP-155.
   *
   * @param chainId - Chain ID for EIP-155. Pass 0n for pre-EIP155 signing.
   */
  sigHash(chainId: bigint): Uint8Array {
    // EIP-155: if chainId is provided and > 0, include it in the hash
    const supportsEIP155 = chainId > 0n
    const message = this.getMessageToSign(chainId, supportsEIP155)
    return keccak256(RLP.encode(message))
  }

  /**
   * Returns the raw RLP-encodable array of the transaction including signature.
   * Format: [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
   */
  raw(): Uint8Array[] {
    return [
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this._gasPrice),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.bytes ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this.v !== undefined ? bigIntToUnpaddedBytes(this.v) : new Uint8Array(0),
      this.r !== undefined ? bigIntToUnpaddedBytes(this.r) : new Uint8Array(0),
      this.s !== undefined ? bigIntToUnpaddedBytes(this.s) : new Uint8Array(0),
    ]
  }
}
