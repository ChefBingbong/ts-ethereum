import { Hardfork } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  Address,
  BIGINT_0,
  BIGINT_2,
  bigIntToUnpaddedBytes,
  ecrecover,
  intToBytes,
  publicToAddress,
  SECP256K1_ORDER_DIV_2,
  unpadBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { TransactionType } from '../../types'
import type { FrozenTransaction } from '../types'
import { getChainId, getTxType } from './accessors'

/**
 * Gets the raw signature values (v, r, s).
 */
export function getRawSignatureValues(tx: FrozenTransaction): {
  v?: bigint
  r?: bigint
  s?: bigint
} {
  return tx.inner.rawSignatureValues()
}

/**
 * Checks if a transaction is signed.
 */
export function isSigned(tx: FrozenTransaction): boolean {
  const sig = getRawSignatureValues(tx)
  return sig.v !== undefined && sig.r !== undefined && sig.s !== undefined
}

/**
 * Gets the message to sign for a transaction.
 */
export function getMessageToSign(
  tx: FrozenTransaction,
): Uint8Array | Uint8Array[] {
  const txType = getTxType(tx)
  const chainId = getChainId(tx)

  if (txType === TransactionType.Legacy) {
    // Legacy transaction message format
    const message = [
      bigIntToUnpaddedBytes(tx.inner.nonce()),
      bigIntToUnpaddedBytes(tx.inner.gasPrice()),
      bigIntToUnpaddedBytes(tx.inner.gas()),
      tx.inner.to() !== undefined ? tx.inner.to()!.bytes : new Uint8Array(0),
      bigIntToUnpaddedBytes(tx.inner.value()),
      tx.inner.data(),
    ]

    // Add EIP-155 fields if chainId is present
    if (chainId !== undefined) {
      message.push(bigIntToUnpaddedBytes(chainId))
      message.push(unpadBytes(intToBytes(0)))
      message.push(unpadBytes(intToBytes(0)))
    }

    return message
  } else {
    // Typed transactions: return the signature hash directly
    return getHashedMessageToSign(tx)
  }
}

/**
 * Gets the hashed message to sign for a transaction.
 */
export function getHashedMessageToSign(tx: FrozenTransaction): Uint8Array {
  const chainId = tx.inner.chainId()
  return tx.inner.sigHash(chainId)
}

/**
 * Gets the sender's address from the transaction signature.
 */
export function getSenderAddress(tx: FrozenTransaction): Address {
  if (!isSigned(tx)) {
    throw new Error('Cannot get sender address: transaction is not signed')
  }

  // Check cache first
  if (tx._cache.sender !== undefined) {
    return tx._cache.sender
  }

  const msgHash = getHashedMessageToSign(tx)
  const sig = getRawSignatureValues(tx)
  const chainId = getChainId(tx)

  // Validate high S value (EIP-2)
  if (
    sig.s !== undefined &&
    sig.s > SECP256K1_ORDER_DIV_2 &&
    tx.hardforkManager.hardforkGte(
      Hardfork.Homestead,
      tx.hardforkManager.getHardforkFromContext({ blockNumber: 0n }),
    )
  ) {
    throw new Error(
      'Invalid Signature: s-values greater than secp256k1n/2 are considered invalid',
    )
  }

  try {
    const publicKey = ecrecover(
      msgHash,
      sig.v!,
      bigIntToUnpaddedBytes(sig.r!),
      bigIntToUnpaddedBytes(sig.s!),
      chainId,
    )
    const sender = new Address(publicToAddress(publicKey, false))

    // Cache the sender (mutation allowed for caching)
    ;(tx._cache as { sender?: Address }).sender = sender

    return sender
  } catch {
    throw new Error('Invalid Signature')
  }
}

/**
 * Verifies the transaction signature.
 */
export function verifySignature(tx: FrozenTransaction): boolean {
  try {
    if (!isSigned(tx)) {
      return false
    }
    const sender = getSenderAddress(tx)
    return sender.bytes.length > 0
  } catch {
    return false
  }
}
