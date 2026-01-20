import {
  Address,
  bigIntToUnpaddedBytes,
  ecrecover,
  publicToAddress,
  SECP256K1_ORDER_DIV_2,
} from '@ts-ethereum/utils'
import type { Signer, TxManager } from '../types'
import { HomesteadSigner } from './homestead'

/**
 * EIP155Signer implements Signer using the EIP-155 rules.
 * Equivalent to Go's EIP155Signer.
 *
 * This accepts transactions which are replay-protected as well as
 * unprotected homestead transactions.
 */
export class EIP155Signer implements Signer {
  private readonly _chainId: bigint
  private readonly _chainIdMul: bigint

  constructor(chainId: bigint) {
    this._chainId = chainId
    this._chainIdMul = chainId * 2n
  }

  /**
   * Returns the chain ID this signer is configured for.
   */
  chainID(): bigint | null {
    return this._chainId
  }

  /**
   * Returns the hash to be signed.
   * For EIP-155: includes chainId in the hash.
   * Equivalent to Go's EIP155Signer.Hash(tx).
   */
  hash(tx: TxManager): Uint8Array {
    return tx.tx.inner.sigHash(this._chainId)
  }

  /**
   * Returns signature values from a 65-byte signature.
   * For EIP-155: V = sig[64] + 35 + chainId * 2
   * Equivalent to Go's EIP155Signer.SignatureValues(tx, sig).
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): { r: bigint; s: bigint; v: bigint } {
    if (tx.type !== 0) {
      throw new Error('Transaction type not supported by EIP155Signer')
    }

    if (sig.length !== 65) {
      throw new Error(`Invalid signature length: got ${sig.length}, want 65`)
    }

    const r = bytesToBigInt(sig.slice(0, 32))
    const s = bytesToBigInt(sig.slice(32, 64))
    // EIP-155: V = sig[64] + 35 + chainId * 2
    const v =
      this._chainId !== 0n
        ? BigInt(sig[64]) + 35n + this._chainIdMul
        : BigInt(sig[64]) + 27n

    return { r, s, v }
  }

  /**
   * Recovers the sender address from the transaction signature.
   * For non-protected txs (v = 27 or 28), delegates to HomesteadSigner.
   * Equivalent to Go's EIP155Signer.Sender(tx).
   */
  sender(tx: TxManager): Address {
    if (tx.type !== 0) {
      throw new Error('Transaction type not supported by EIP155Signer')
    }

    // Check if this is a non-protected transaction
    if (!tx.protected()) {
      return new HomesteadSigner().sender(tx)
    }

    // Verify chain ID matches
    const txChainId = tx.chainId()
    if (txChainId !== this._chainId) {
      throw new Error(
        `Invalid chain ID: have ${txChainId}, want ${this._chainId}`,
      )
    }

    const [v, r, s] = tx.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Invalid signature: transaction is not signed')
    }

    // Validate S value (EIP-2 / Homestead rule)
    if (s > SECP256K1_ORDER_DIV_2) {
      throw new Error(
        'Invalid signature: s-values greater than secp256k1n/2 are invalid',
      )
    }

    // Pass original V and chainId to ecrecover - it handles the adjustment internally
    // ecrecover calculates: recovery = (v - 35 - chainId*2) when chainId is provided
    const sigHash = this.hash(tx)
    const publicKey = ecrecover(
      sigHash,
      v,
      bigIntToUnpaddedBytes(r),
      bigIntToUnpaddedBytes(s),
      this._chainId,
    )

    return new Address(publicToAddress(publicKey, false))
  }

  equal(other: Signer): boolean {
    if (!(other instanceof EIP155Signer)) {
      return false
    }
    return this._chainId === other._chainId
  }
}

/**
 * Helper to convert bytes to bigint
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}
