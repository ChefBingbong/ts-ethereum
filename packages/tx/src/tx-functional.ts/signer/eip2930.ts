import type { Address } from '@ts-ethereum/utils'
import { TransactionType } from '../../types'
import type { Signer, TxManager } from '../types'
import { EIP155Signer } from './eip155'

/**
 * EIP2930Signer implements Signer for EIP-2930 access list transactions.
 * Equivalent to Go's modernSigner with Berlin fork.
 *
 * Accepts:
 * - EIP-2930 access list transactions
 * - EIP-155 replay protected transactions
 * - Legacy Homestead transactions
 */
export class EIP2930Signer implements Signer {
  private readonly _chainId: bigint
  private readonly _legacy: EIP155Signer

  constructor(chainId: bigint) {
    this._chainId = chainId
    this._legacy = new EIP155Signer(chainId)
  }

  chainID(): bigint | null {
    return this._chainId
  }

  /**
   * Returns the hash to be signed.
   */
  hash(tx: TxManager): Uint8Array {
    return tx.tx.inner.sigHash(this._chainId)
  }

  /**
   * Returns signature values from a 65-byte signature.
   * For typed transactions (EIP-2718): V = sig[64] (0 or 1)
   * For legacy: delegates to EIP155Signer
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): { r: bigint; s: bigint; v: bigint } {
    if (tx.type === TransactionType.Legacy) {
      return this._legacy.signatureValues(tx, sig)
    }

    if (!this.supportsType(tx.type)) {
      throw new Error(`Transaction type ${tx.type} not supported`)
    }

    // Check chain ID matches
    if (tx.chainId() !== 0n && tx.chainId() !== this._chainId) {
      throw new Error(
        `Invalid chain ID: have ${tx.chainId()}, want ${this._chainId}`,
      )
    }

    if (sig.length !== 65) {
      throw new Error(`Invalid signature length: got ${sig.length}, want 65`)
    }

    const r = bytesToBigInt(sig.slice(0, 32))
    const s = bytesToBigInt(sig.slice(32, 64))
    // For typed transactions: V is just 0 or 1
    const v = BigInt(sig[64])

    return { r, s, v }
  }

  /**
   * Recovers the sender address.
   */
  sender(tx: TxManager): Address {
    if (tx.type === TransactionType.Legacy) {
      return this._legacy.sender(tx)
    }

    if (!this.supportsType(tx.type)) {
      throw new Error(`Transaction type ${tx.type} not supported`)
    }

    if (tx.chainId() !== this._chainId) {
      throw new Error(
        `Invalid chain ID: have ${tx.chainId()}, want ${this._chainId}`,
      )
    }

    // For typed transactions, V is 0 or 1, add 27 to get standard format
    const [v, r, s] = tx.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Invalid signature: transaction is not signed')
    }

    const adjustedV = v + 27n
    const sigHash = this.hash(tx)

    const { ecrecover, publicToAddress, bigIntToUnpaddedBytes, Address } =
      require('@ts-ethereum/utils')
    const publicKey = ecrecover(
      sigHash,
      adjustedV,
      bigIntToUnpaddedBytes(r),
      bigIntToUnpaddedBytes(s),
    )

    return new Address(publicToAddress(publicKey, false))
  }

  /**
   * Check if this signer supports the given tx type.
   */
  protected supportsType(txType: TransactionType): boolean {
    return (
      txType === TransactionType.Legacy ||
      txType === TransactionType.AccessListEIP2930
    )
  }

  equal(other: Signer): boolean {
    if (!(other instanceof EIP2930Signer)) {
      return false
    }
    return this._chainId === other._chainId
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}
