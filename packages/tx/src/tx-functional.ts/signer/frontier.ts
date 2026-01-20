import {
  Address,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  ecrecover,
  publicToAddress,
} from '@ts-ethereum/utils'
import type { Signer, TxManager } from '../types'

/**
 * Recovers an address from a signature hash and signature values.
 *
 * @param sigHash - The hash that was signed
 * @param r - Signature R value
 * @param s - Signature S value
 * @param v - Signature V value (27 or 28 for pre-EIP155)
 * @param chainId - Optional chain ID for EIP-155 recovery
 * @returns The recovered address
 */
export function recoverAddress(
  sigHash: Uint8Array,
  r: bigint,
  s: bigint,
  v: bigint,
  chainId?: bigint,
): Address {
  const publicKey = ecrecover(
    sigHash,
    v,
    bigIntToUnpaddedBytes(r),
    bigIntToUnpaddedBytes(s),
    chainId,
  )

  return new Address(publicToAddress(publicKey, false))
}

/**
 * FrontierSigner implements Signer using the frontier rules (pre-Homestead).
 * This is the original Ethereum signing scheme without replay protection.
 */
export class FrontierSigner implements Signer {
  /**
   * FrontierSigner has no chain ID (pre-EIP155).
   */
  chainID(): bigint | null {
    return null
  }

  /**
   * Returns the hash to be signed.
   * For Frontier: hash of [nonce, gasPrice, gasLimit, to, value, data]
   * No chainId is included.
   */
  hash(tx: TxManager): Uint8Array {
    // For FrontierSigner, we don't include chainId (pass 0n for no EIP-155)
    return tx.tx.inner.sigHash(0n)
  }

  /**
   * Decodes signature values from a 65-byte signature.
   * Returns [R, S, V] where V = sig[64] + 27
   */
  signatureValues(tx: TxManager, sig: Uint8Array): [bigint, bigint, bigint] {
    if (sig.length !== 65) {
      throw new Error(`Invalid signature length: got ${sig.length}, want 65`)
    }

    const r = bytesToBigInt(sig.slice(0, 32))
    const s = bytesToBigInt(sig.slice(32, 64))
    // V is recovery id (0 or 1) + 27 for legacy transactions
    const v = BigInt(sig[64]) + 27n

    return [r, s, v]
  }

  /**
   * Recovers the sender address from the transaction signature.
   * Uses recoverAddress without strict S validation (pre-Homestead).
   */
  getSenderAddress(tx: TxManager): Address {
    const [v, r, s] = tx.tx.inner.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Cannot recover sender: transaction is not signed')
    }

    const sigHash = this.hash(tx)
    return recoverAddress(sigHash, r, s, v)
  }

  equal(other: Signer): boolean {
    return other instanceof FrontierSigner
  }
}
