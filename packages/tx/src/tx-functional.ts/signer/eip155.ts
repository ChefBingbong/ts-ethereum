import {
  Address,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  ecrecover,
  publicToAddress,
  SECP256K1_ORDER_DIV_2,
} from '@ts-ethereum/utils'
import type { Signer, TxManager } from '../types'
import { HomesteadSigner } from './homestead'

/**
 * EIP155Signer implements Signer using the EIP-155 rules.
 * This provides replay protection by including the chain ID in the signature.
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
   * For EIP-155: hash of [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
   */
  hash(tx: TxManager): Uint8Array {
    return tx.tx.inner.sigHash(this._chainId)
  }

  /**
   * Decodes signature values from a 65-byte signature.
   * For EIP-155: V = sig[64] + 35 + chainId * 2
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): [bigint, bigint, bigint] {
    if (sig.length !== 65) {
      throw new Error(
        `Invalid signature length: got ${sig.length}, want 65`,
      )
    }

    const r = bytesToBigInt(sig.slice(0, 32))
    const s = bytesToBigInt(sig.slice(32, 64))
    // EIP-155: V = sig[64] + 35 + chainId * 2
    const v = BigInt(sig[64]) + 35n + this._chainIdMul

    return [r, s, v]
  }

  /**
   * Recovers the sender address from the transaction signature.
   *
   * For non-protected transactions (v = 27 or 28), delegates to HomesteadSigner.
   * For EIP-155 protected transactions, adjusts V before recovery.
   */
  getSenderAddress(tx: TxManager): Address {
    const [v, r, s] = tx.tx.inner.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Cannot recover sender: transaction is not signed')
    }

    // Check if this is a non-protected transaction (v = 27 or 28)
    if (v === 27n || v === 28n) {
      // Delegate to HomesteadSigner for non-protected txs
      return new HomesteadSigner().getSenderAddress(tx)
    }

    // Verify chain ID matches
    const txChainId = tx.tx.inner.chainID()
    if (txChainId !== this._chainId) {
      throw new Error(
        `Invalid chain ID: have ${txChainId}, want ${this._chainId}`,
      )
    }

    // For EIP-155: recover V by subtracting (chainId * 2 + 8)
    // V was encoded as: recovery + 35 + chainId * 2
    // So: recovery = V - 35 - chainId * 2 = V - (chainId * 2 + 35)
    // But we need V in 27/28 format for ecrecover
    // recovery = 0 or 1, so V for ecrecover = recovery + 27
    // Therefore: V_ecrecover = (V - 35 - chainId * 2) + 27 = V - chainId * 2 - 8
    const adjustedV = v - this._chainIdMul - 8n

    // Validate S value (EIP-2 / Homestead rule)
    if (s > SECP256K1_ORDER_DIV_2) {
      throw new Error(
        'Invalid Signature: s-values greater than secp256k1n/2 are considered invalid',
      )
    }

    const sigHash = this.hash(tx)
    const publicKey = ecrecover(
      sigHash,
      adjustedV,
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
