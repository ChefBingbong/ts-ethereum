import { RLP } from '@ts-ethereum/rlp'
import type { Address } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  BIGINT_2,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  EthereumJSErrorWithoutCode,
  intToBytes,
  toBytes,
  unpadBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { TransactionType } from '../../types'
import { TransactionType as TxType } from '../../types'
import type { TxData } from '../types'

/**
 * Legacy transaction data (pre-EIP-2718).
 * Implements the TxData interface for legacy transactions.
 */
export class LegacyTxData implements TxData {
  readonly nonce: bigint
  readonly gasPrice: bigint
  readonly _gas: bigint
  readonly to?: Address
  readonly value: bigint
  readonly _data: Uint8Array
  v?: bigint
  r?: bigint
  s?: bigint

  constructor(
    nonce: bigint,
    gasPrice: bigint,
    gas: bigint,
    to: Address | undefined,
    value: bigint,
    data: Uint8Array,
    v?: bigint,
    r?: bigint,
    s?: bigint,
  ) {
    this.nonce = nonce
    this.gasPrice = gasPrice
    this._gas = gas
    this.to = to
    this.value = value
    this._data = data
    this.v = v
    this.r = r
    this.s = s
  }

  txType(): TransactionType {
    return TxType.Legacy
  }

  copy(): TxData {
    return new LegacyTxData(
      this.nonce,
      this.gasPrice,
      this._gas,
      this.to,
      this.value,
      new Uint8Array(this._data),
      this.v,
      this.r,
      this.s,
    )
  }

  chainId(): bigint | undefined {
    return deriveChainId(this.v)
  }

  accessList(): never[] {
    return []
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
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasPrice),
      bigIntToUnpaddedBytes(this._gas),
      this.to !== undefined ? this.to.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this._data,
    ]

    // If EIP-155 is active, include chainId in signature hash
    if (chainID !== undefined) {
      message.push(bigIntToUnpaddedBytes(chainID))
      message.push(unpadBytes(intToBytes(0)))
      message.push(unpadBytes(intToBytes(0)))
    }

    return keccak256(RLP.encode(message))
  }
}

/**
 * Derives the chain ID from the v value in a legacy transaction signature.
 * For EIP-155 transactions: v = chainId * 2 + 35 or chainId * 2 + 36
 * @param v - The v signature value
 * @returns The chain ID, or undefined if not EIP-155 protected
 */
function deriveChainId(v: bigint | undefined): bigint | undefined {
  if (v === undefined) {
    return undefined
  }

  const vNum = Number(v)

  // Pre-EIP-155 signatures: v is 27 or 28
  if (vNum === 27 || vNum === 28) {
    return undefined
  }

  // EIP-155 signatures: v >= 37
  if (vNum < 37) {
    return undefined
  }

  // Derive chain ID: v = chainId * 2 + 35 or chainId * 2 + 36
  const numSub = (vNum - 35) % 2 === 0 ? 35 : 36
  return BigInt(vNum - numSub) / BIGINT_2
}
