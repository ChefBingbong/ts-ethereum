/**
 * Transaction signing functions following Go-Ethereum's pattern exactly.
 *
 * Go's signing API:
 * - SignTx(tx, signer, privateKey) -> signs a transaction
 * - SignNewTx(privateKey, signer, txData) -> creates and signs in one step
 * - Sender(signer, tx) -> recovers sender address (with caching)
 */

import type { Address } from '@ts-ethereum/utils'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import type { Signer, TxManager } from './types'

/**
 * SignTx signs the transaction using the given signer and private key.
 * Equivalent to Go's SignTx function.
 *
 * @param tx - The transaction to sign
 * @param signer - The signer that determines hash and signature encoding
 * @param privateKey - The private key to sign with (32 bytes)
 * @returns A new TxManager with the signature attached
 */
export function signTx(
  tx: TxManager,
  signer: Signer,
  privateKey: Uint8Array,
): TxManager {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes')
  }

  // Get the hash to sign from the signer
  const h = signer.hash(tx)

  // Sign the hash
  const signature = secp256k1.sign(h, privateKey)

  if (signature.recovery === undefined) {
    throw new Error('Invalid signature recovery')
  }

  // Build 65-byte signature [R || S || V] where V is 0 or 1
  const sig = new Uint8Array(65)
  sig.set(signature.toCompactRawBytes(), 0)
  sig[64] = signature.recovery

  // Use tx.withSignature to add the signature
  return tx.withSignature(signer, sig)
}

/**
 * Sender returns the address derived from the signature using the given signer.
 * Equivalent to Go's Sender function.
 *
 * The result is cached on the transaction for performance.
 *
 * @param signer - The signer to use for recovery
 * @param tx - The signed transaction
 * @returns The sender's address
 */
export function sender(signer: Signer, tx: TxManager): Address {
  // Check cache first
  const cache = tx.cache as { senderCache?: { signer: Signer; from: Address } }
  if (cache.senderCache !== undefined) {
    if (cache.senderCache.signer.equal(signer)) {
      return cache.senderCache.from
    }
  }

  // Recover the sender address via the signer
  const addr = signer.sender(tx)

  // Cache the result
  cache.senderCache = { signer, from: addr }

  return addr
}

// Export Go-style aliases
export { sender as Sender, signTx as SignTx }
