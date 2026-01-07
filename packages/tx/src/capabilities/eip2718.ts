import type { Input } from '@ts-ethereum/rlp'
import { RLP } from '@ts-ethereum/rlp'
import {
  BIGINT_0,
  BIGINT_1,
  concatBytes,
  EthereumJSErrorWithoutCode,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { EIP2718CompatibleTx } from '../types'
import { txTypeBytes } from '../util/internal'
import { errorMsg } from './legacy'

/**
 * Gets the hashed message to sign for EIP-2718 transactions
 * @param tx - The EIP-2718 compatible transaction
 * @returns Hashed message to sign
 */
export function getHashedMessageToSign(tx: EIP2718CompatibleTx): Uint8Array {
  const keccakFunction = keccak256
  return keccakFunction(tx.getMessageToSign())
}

/**
 * Serializes an EIP-2718 transaction
 * @param tx - The EIP-2718 compatible transaction
 * @param base - Optional base input for RLP encoding
 * @returns Serialized transaction bytes
 */
export function serialize(tx: EIP2718CompatibleTx, base?: Input): Uint8Array {
  return concatBytes(txTypeBytes(tx.type), RLP.encode(base ?? tx.raw()))
}

/**
 * Validates the y-parity value of an EIP-2718 transaction
 * @param tx - The EIP-2718 compatible transaction
 * @throws EthereumJSErrorWithoutCode if y-parity is invalid
 */
export function validateYParity(tx: EIP2718CompatibleTx) {
  const { v } = tx
  if (v !== undefined && v !== BIGINT_0 && v !== BIGINT_1) {
    const msg = errorMsg(
      tx,
      'The y-parity of the transaction should either be 0 or 1',
    )
    throw EthereumJSErrorWithoutCode(msg)
  }
}
