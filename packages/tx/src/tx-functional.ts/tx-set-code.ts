import { RLP, type Input } from '@ts-ethereum/rlp'
import type { Address, EOACode7702AuthorizationListBytes } from '@ts-ethereum/utils'
import { bigIntToUnpaddedBytes, concatBytes } from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { AccessListBytes } from '../types'
import { TransactionType } from '../types'
import type { TxData } from './types'

/**
 * SetCodeTxData implements TxData for EIP-7702 set code transactions.
 * Equivalent to Go's SetCodeTx struct.
 *
 * Transaction type: 4
 * EIP: https://eips.ethereum.org/EIPS/eip-7702
 *
 * This tx type allows EOAs to temporarily install code at their address
 * via an authorization list.
 */
export class SetCodeTxData implements TxData {
  readonly type = TransactionType.EOACodeEIP7702
  readonly chainId: bigint
  readonly nonce: bigint
  readonly maxPriorityFeePerGas: bigint
  readonly maxFeePerGas: bigint
  readonly gasLimit: bigint
  readonly to: Address // Required for set code txs (cannot create contracts)
  readonly value: bigint
  readonly data: Uint8Array
  readonly _accessList: AccessListBytes
  readonly authorizationList: EOACode7702AuthorizationListBytes
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
    authorizationList: EOACode7702AuthorizationListBytes
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
    this.authorizationList = data.authorizationList
    this.v = data.v
    this.r = data.r
    this.s = data.s
  }

  copy(): TxData {
    return new SetCodeTxData({
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
      authorizationList: this.authorizationList.map((auth) =>
        auth.map((item) => new Uint8Array(item as Uint8Array)) as typeof auth,
      ),
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
   * For set code txs, gasPrice() returns the fee cap like Go does.
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
    return new SetCodeTxData({
      chainId: this.chainId,
      nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas,
      maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit,
      to: this.to,
      value: this.value,
      data: this.data,
      accessList: this._accessList,
      authorizationList: this.authorizationList,
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
   * Returns the unsigned transaction fields to be hashed for signing.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, authorizationList]
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
      this.authorizationList as Input,
    ]
  }

  /**
   * Returns the hash of the unsigned transaction for signing.
   * For EIP-7702: keccak256(0x04 || rlp([chainId, nonce, ...]))
   */
  sigHash(_chainId: bigint): Uint8Array {
    const message = this.getMessageToSign()
    const encoded = RLP.encode(message)
    return keccak256(concatBytes(new Uint8Array([this.type]), encoded))
  }

  /**
   * Returns the raw RLP-encodable array of the transaction including signature.
   * Format: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, authorizationList, v, r, s]
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
      this.authorizationList as Input,
      this.v !== undefined ? bigIntToUnpaddedBytes(this.v) : new Uint8Array(0),
      this.r !== undefined ? bigIntToUnpaddedBytes(this.r) : new Uint8Array(0),
      this.s !== undefined ? bigIntToUnpaddedBytes(this.s) : new Uint8Array(0),
    ]
  }
}
