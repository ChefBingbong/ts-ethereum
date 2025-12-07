import { keccak256 } from 'ethereum-cryptography/keccak.js'
import * as RLP from '../../rlp'
import {
  BIGINT_2,
  EthereumJSErrorWithoutCode,
  MAX_INTEGER,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  toBytes,
} from '../../utils'

import { paramsTx } from '..'
import * as Legacy from '../capabilities/legacy.ts'
import { Capability, TransactionType } from '../types.ts'
import { getBaseJSON, sharedConstructor, valueOverflowCheck } from '../util/internal.ts'

import { createLegacyTx } from './constructors.ts'

import type { Common } from '../../chain-config'
import type { Address } from '../../utils'
import type {
  TxData as AllTypesTxData,
  TxValuesArray as AllTypesTxValuesArray,
  JSONTx,
  TransactionCache,
  TransactionInterface,
  TxOptions,
} from '../types.ts'

export type TxData = AllTypesTxData[typeof TransactionType.Legacy]
export type TxValuesArray = AllTypesTxValuesArray[typeof TransactionType.Legacy]

/**
 * Validates tx's `v` value
 * Accepts both pre-EIP-155 (v = 27 or 28) and EIP-155 (v = chainId * 2 + 35 or 36)
 */
function validateV(common: Common, _v?: bigint): void {
  const v = _v !== undefined ? Number(_v) : undefined
  if (v !== undefined) {
    // Pre-EIP-155: v = 27 or 28
    if (v === 27 || v === 28) {
      return
    }
    // EIP-155: v = chainId * 2 + 35 + recovery_id (where recovery_id is 0 or 1)
    const chainId = common.chainId()
    const eip155V0 = Number(chainId) * 2 + 35
    const eip155V1 = Number(chainId) * 2 + 36
    if (v === eip155V0 || v === eip155V1) {
      return
    }
    throw EthereumJSErrorWithoutCode(
      `Invalid v value. Expected 27, 28, ${eip155V0}, or ${eip155V1}, got v = ${v}`,
    )
  }
}

/**
 * An Ethereum non-typed (legacy) transaction
 * Simplified for Frontier/Chainstart - no EIP-155 replay protection
 */
export class LegacyTx implements TransactionInterface<typeof TransactionType.Legacy> {
  /* Tx public data fields */
  public type = TransactionType.Legacy // Legacy tx type

  // Tx data part (part of the RLP)
  public readonly gasPrice: bigint
  public readonly nonce!: bigint
  public readonly gasLimit!: bigint
  public readonly value!: bigint
  public readonly data!: Uint8Array
  public readonly to?: Address

  // Props only for signed txs
  public readonly v?: bigint
  public readonly r?: bigint
  public readonly s?: bigint

  // End of Tx data part

  /* Other handy tx props */
  public readonly common!: Common
  private keccakFunction: (msg: Uint8Array) => Uint8Array

  readonly txOptions!: TxOptions

  readonly cache: TransactionCache = {}

  /**
   * List of tx type defining EIPs - empty for Frontier
   */
  protected activeCapabilities: number[] = []

  /**
   * This constructor takes the values, validates them, assigns them and freezes the object.
   *
   * It is not recommended to use this constructor directly. Instead use
   * the static factory methods to assist in creating a Transaction object from
   * varying data types.
   */
  public constructor(txData: TxData, opts: TxOptions = {}) {
    sharedConstructor(this, txData, opts)

    this.gasPrice = bytesToBigInt(toBytes(txData.gasPrice))
    valueOverflowCheck({ gasPrice: this.gasPrice })

    this.common.updateParams(opts.params ?? paramsTx)

    validateV(this.common, this.v)

    this.keccakFunction = this.common.customCrypto.keccak256 ?? keccak256

    if (this.gasPrice * this.gasLimit > MAX_INTEGER) {
      throw EthereumJSErrorWithoutCode('gas limit * gasPrice cannot exceed MAX_INTEGER (2^256-1)')
    }

    const freeze = opts?.freeze ?? true
    if (freeze) {
      Object.freeze(this)
    }
  }

  /**
   * Checks if a tx type defining capability is active
   * on a tx, for example the EIP-1559 fee market mechanism
   * or the EIP-2930 access list feature.
   *
   * For Frontier, this always returns false as no EIPs are active.
   */
  supports(capability: Capability) {
    return this.activeCapabilities.includes(capability)
  }

  /**
   * Indicates whether the transaction already contains signature values.
   * @returns true if `v`, `r`, and `s` are populated
   */
  isSigned(): boolean {
    return Legacy.isSigned(this)
  }

  /**
   * Computes the effective priority fee for this legacy transaction.
   * @param baseFee - Optional base fee (not used in Frontier)
   * @returns Priority fee portion denominated in wei
   */
  getEffectivePriorityFee(baseFee?: bigint): bigint {
    return Legacy.getEffectivePriorityFee(this.gasPrice, baseFee)
  }

  /**
   * Returns a Uint8Array Array of the raw Bytes of the legacy transaction, in order.
   *
   * Format: `[nonce, gasPrice, gasLimit, to, value, data, v, r, s]`
   */
  raw(): TxValuesArray {
    return [
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasPrice),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to !== undefined ? this.to.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
      this.v !== undefined ? bigIntToUnpaddedBytes(this.v) : new Uint8Array(0),
      this.r !== undefined ? bigIntToUnpaddedBytes(this.r) : new Uint8Array(0),
      this.s !== undefined ? bigIntToUnpaddedBytes(this.s) : new Uint8Array(0),
    ]
  }

  /**
   * Returns the serialized encoding of the legacy transaction.
   *
   * Format: `rlp([nonce, gasPrice, gasLimit, to, value, data, v, r, s])`
   */
  serialize(): Uint8Array {
    return RLP.encode(this.raw())
  }

  /**
   * Returns the raw unsigned tx, which can be used
   * to sign the transaction (e.g. for sending to a hardware wallet).
   *
   * For Frontier, this is just the first 6 fields: [nonce, gasPrice, gasLimit, to, value, data]
   * @returns Array representing the unsigned transaction fields
   */
  getMessageToSign(): Uint8Array[] {
    return [
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasPrice),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to !== undefined ? this.to.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      this.data,
    ]
  }

  /**
   * Returns the hashed serialized unsigned tx, which can be used
   * to sign the transaction (e.g. for sending to a hardware wallet).
   * @returns Hash of the unsigned transaction payload
   */
  getHashedMessageToSign() {
    const message = this.getMessageToSign()
    return this.keccakFunction(RLP.encode(message))
  }

  /**
   * The amount of gas paid for the data in this tx
   */
  getDataGas(): bigint {
    return Legacy.getDataGas(this)
  }

  /**
   * If the tx's `to` is to the creation address
   */
  toCreationAddress(): boolean {
    return Legacy.toCreationAddress(this)
  }

  /**
   * The minimum gas limit which the tx to have to be valid.
   */
  getIntrinsicGas(): bigint {
    return Legacy.getIntrinsicGas(this)
  }

  /**
   * The up front amount that an account must have for this transaction to be valid
   */
  getUpfrontCost(): bigint {
    return this.gasLimit * this.gasPrice + this.value
  }

  /**
   * Computes a sha3-256 hash of the serialized tx.
   *
   * This method can only be used for signed txs (it throws otherwise).
   * Use {@link Transaction.getMessageToSign} to get a tx hash for the purpose of signing.
   * @returns Hash of the serialized signed transaction
   */
  hash(): Uint8Array {
    return Legacy.hash(this)
  }

  /**
   * Computes a sha3-256 hash which can be used to verify the signature.
   * Handles both pre-EIP-155 and EIP-155 signatures.
   * @returns Hash used when verifying the signature
   */
  getMessageToVerifySignature() {
    if (!this.isSigned()) {
      const msg = Legacy.errorMsg(this, 'This transaction is not signed')
      throw EthereumJSErrorWithoutCode(msg)
    }
    
    // Detect if this is an EIP-155 signature by checking v value
    // Pre-EIP-155: v = 27 or 28
    // EIP-155: v = chainId * 2 + 35 or chainId * 2 + 36
    const vNum = Number(this.v!)
    const isEIP155 = vNum !== 27 && vNum !== 28
    
    if (isEIP155) {
      // For EIP-155, the signed message includes chainId, 0, 0
      const message = [
        ...this.getMessageToSign(),
        bigIntToUnpaddedBytes(this.common.chainId()),
        new Uint8Array(0),
        new Uint8Array(0),
      ]
      return this.keccakFunction(RLP.encode(message))
    }
    
    // Pre-EIP-155: just use the 6-element message
    return this.getHashedMessageToSign()
  }

  /**
   * Returns the public key of the sender
   * @returns Sender public key
   */
  getSenderPublicKey(): Uint8Array {
    return Legacy.getSenderPublicKey(this)
  }

  /**
   * Adds a signature (or replaces an existing one) and returns a new transaction instance.
   * @param v - Recovery parameter (0 or 1)
   * @param r - `r` value of the signature
   * @param s - `s` value of the signature
   * @param convertV - When true, converts the recovery ID into v=27 or v=28
   * @returns A new `LegacyTx` that includes the provided signature
   */
  addSignature(
    v: bigint,
    r: Uint8Array | bigint,
    s: Uint8Array | bigint,
    convertV: boolean = false,
  ): LegacyTx {
    r = toBytes(r)
    s = toBytes(s)
    // For Frontier, v is simply 27 or 28
    if (convertV) {
      v += BigInt(27)
    }

    const opts = { ...this.txOptions, common: this.common }

    return createLegacyTx(
      {
        nonce: this.nonce,
        gasPrice: this.gasPrice,
        gasLimit: this.gasLimit,
        to: this.to,
        value: this.value,
        data: this.data,
        v,
        r: bytesToBigInt(r),
        s: bytesToBigInt(s),
      },
      opts,
    )
  }

  /**
   * Returns an object with the JSON representation of the transaction.
   * @returns JSON encoding of the transaction
   */
  toJSON(): JSONTx {
    const baseJSON = getBaseJSON(this) as JSONTx
    baseJSON.gasPrice = bigIntToHex(this.gasPrice)

    return baseJSON
  }

  /**
   * Validates the transaction and returns any encountered errors.
   * @returns Array containing validation error messages
   */
  getValidationErrors(): string[] {
    return Legacy.getValidationErrors(this)
  }

  /**
   * Determines whether the transaction passes all validation checks.
   * @returns true if no validation errors were found
   */
  isValid(): boolean {
    return Legacy.isValid(this)
  }

  /**
   * Checks whether the stored signature can be successfully verified.
   * @returns true if the signature is valid
   */
  verifySignature(): boolean {
    return Legacy.verifySignature(this)
  }

  /**
   * Returns the recovered sender address.
   * @returns Sender {@link Address}
   */
  getSenderAddress(): Address {
    return Legacy.getSenderAddress(this)
  }

  /**
   * Signs the transaction with the provided private key and returns the new signed instance.
   * @param privateKey - 32-byte private key used to sign the transaction
   * @param extraEntropy - Optional entropy passed to the signing routine
   * @returns A new signed `LegacyTx`
   */
  sign(privateKey: Uint8Array, extraEntropy: Uint8Array | boolean = false): LegacyTx {
    return Legacy.sign(this, privateKey, extraEntropy) as LegacyTx
  }

  /**
   * Return a compact error string representation of the object
   * @returns Human-readable error summary
   */
  public errorStr() {
    let errorStr = Legacy.getSharedErrorPostfix(this)
    errorStr += ` gasPrice=${this.gasPrice}`
    return errorStr
  }
}
