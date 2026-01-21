import {
  Address,
  bigIntToUnpaddedBytes,
  ecrecover,
  publicToAddress,
} from '@ts-ethereum/utils'
import type { Signer, TxManager } from '../types'

/**
 * Recovers an address from a signature hash and signature values.
 * Equivalent to Go's recoverPlain function.
 *
 * @param sigHash - The hash that was signed
 * @param r - Signature R value
 * @param s - Signature S value
 * @param v - Signature V value (27 or 28)
 * @param homestead - Whether to use Homestead (strict S) validation
 * @returns The recovered address
 */
export function recoverPlain(
  sigHash: Uint8Array,
  r: bigint,
  s: bigint,
  v: bigint,
  homestead: boolean,
): Address {
  // V should be 27 or 28, convert to recovery id (0 or 1)
  if (v < 27n) {
    throw new Error('Invalid signature v value')
  }

  const publicKey = ecrecover(
    sigHash,
    v,
    bigIntToUnpaddedBytes(r),
    bigIntToUnpaddedBytes(s),
  )

  return new Address(publicToAddress(publicKey, false))
}

/**
 * Decodes a 65-byte signature into R, S, V values.
 * Equivalent to Go's decodeSignature function.
 *
 * @param sig - 65-byte signature [R || S || V]
 * @returns Object with r, s, v values where v = sig[64] + 27
 */
export function decodeSignature(sig: Uint8Array): {
  r: bigint
  s: bigint
  v: bigint
} {
  if (sig.length !== 65) {
    throw new Error(`Invalid signature length: got ${sig.length}, want 65`)
  }

  const r = bytesToBigInt(sig.slice(0, 32))
  const s = bytesToBigInt(sig.slice(32, 64))
  const v = BigInt(sig[64]) + 27n

  return { r, s, v }
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

/**
 * FrontierSigner implements Signer using the frontier rules (pre-Homestead).
 * Equivalent to Go's FrontierSigner.
 *
 * This is the original Ethereum signing scheme without replay protection
 * and without strict S value validation.
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
   * Equivalent to Go's FrontierSigner.Hash(tx).
   */
  hash(tx: TxManager): Uint8Array {
    // For FrontierSigner, we don't include chainId (pass 0n)
    return tx.tx.inner.sigHash(0n)
  }

  /**
   * Returns signature values from a 65-byte signature.
   * V = sig[64] + 27 (standard Ethereum encoding).
   * Equivalent to Go's FrontierSigner.SignatureValues(tx, sig).
   */
  signatureValues(
    tx: TxManager,
    sig: Uint8Array,
  ): { r: bigint; s: bigint; v: bigint } {
    if (tx.type !== 0) {
      throw new Error('Transaction type not supported by FrontierSigner')
    }
    return decodeSignature(sig)
  }

  /**
   * Recovers the sender address from the transaction signature.
   * Equivalent to Go's FrontierSigner.Sender(tx).
   */
  sender(tx: TxManager): Address {
    if (tx.type !== 0) {
      throw new Error('Transaction type not supported by FrontierSigner')
    }

    const [v, r, s] = tx.rawSignatureValues()
    if (v === undefined || r === undefined || s === undefined) {
      throw new Error('Invalid signature: transaction is not signed')
    }

    const sigHash = this.hash(tx)
    // Frontier uses homestead=false (no strict S validation)
    return recoverPlain(sigHash, r, s, v, false)
  }

  equal(other: Signer): boolean {
    return (
      other instanceof FrontierSigner && !(other instanceof HomesteadSigner)
    )
  }
}

// Forward declaration for circular dependency
import { HomesteadSigner } from './homestead'
