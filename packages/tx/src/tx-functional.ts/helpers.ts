import { Hardfork } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  type Address,
  BIGINT_0,
  bigIntMax,
  bigIntToHex,
  bytesToHex,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { Capability, type JSONTx, TransactionType } from '../types'
import { makeSigner } from './signer/signer-factory'
import { sender } from './signing'
import { createTxManagerFromTx } from './tx-manager'
import type { FrozenTx, Signer } from './types'

// ============================================================================
// Transaction Type Checks (Go-style)
// ============================================================================

/**
 * Checks if a V value indicates EIP-155 replay protection.
 * Equivalent to Go's isProtectedV function.
 */
export function isProtectedV(v: bigint): boolean {
  return v !== 27n && v !== 28n && v !== 1n && v !== 0n
}

/**
 * Returns whether the transaction is replay-protected (EIP-155).
 * Equivalent to Go's Transaction.Protected() method.
 */
export function isProtected(tx: FrozenTx): boolean {
  if (tx.inner.type === TransactionType.Legacy) {
    const v = tx.inner.v
    return v !== undefined && isProtectedV(v)
  }
  // All typed transactions (EIP-2718) are inherently protected
  return true
}

/**
 * Checks if the transaction is a typed transaction (EIP-2718).
 */
export function isTypedTransaction(tx: FrozenTx): boolean {
  return tx.inner.type !== TransactionType.Legacy
}

/**
 * Checks if the transaction supports EIP-1559 fee market.
 */
export function supportsFeeMarket(tx: FrozenTx): boolean {
  return (
    tx.inner.type === TransactionType.FeeMarketEIP1559 ||
    tx.inner.type === TransactionType.BlobEIP4844 ||
    tx.inner.type === TransactionType.EOACodeEIP7702
  )
}

/**
 * Checks if the transaction supports access lists.
 */
export function supportsAccessList(tx: FrozenTx): boolean {
  return tx.inner.type !== TransactionType.Legacy
}

/**
 * Legacy supports() function for backward compatibility.
 * @deprecated Use isProtected(), isTypedTransaction(), etc. instead
 */
export function supports(tx: FrozenTx, capability: Capability): boolean {
  switch (capability) {
    case Capability.EIP155ReplayProtection:
      if (tx.inner.type === TransactionType.Legacy && !isSigned(tx)) {
        return tx.common.hardforkGte(tx.fork, 'spuriousDragon')
      }
      return isProtected(tx)
    case Capability.EIP2718TypedTransaction:
      return isTypedTransaction(tx)
    case Capability.EIP2930AccessLists:
      return supportsAccessList(tx)
    case Capability.EIP1559FeeMarket:
      return supportsFeeMarket(tx)
    case Capability.EIP7702EOACode:
      return tx.inner.type === TransactionType.EOACodeEIP7702
    default:
      return false
  }
}

// ============================================================================
// Signature Helpers
// ============================================================================

/**
 * Checks if a transaction is signed.
 */
export function isSigned(tx: FrozenTx): boolean {
  const { v, r, s } = tx.inner
  return v !== undefined && r !== undefined && s !== undefined
}

/**
 * Returns the appropriate signer for the transaction based on hardfork.
 */
function getSignerForTx(tx: FrozenTx): Signer {
  return makeSigner(tx.common, undefined, undefined)
}

/**
 * Recovers the sender's public key from the transaction signature.
 * Note: Go doesn't expose this - use getSenderAddress instead.
 */
export function getSenderPublicKey(_tx: FrozenTx): Uint8Array {
  throw new Error('getSenderPublicKey is not supported - use getSenderAddress')
}

/**
 * Returns the sender's address.
 * Equivalent to Go's Sender(signer, tx) function.
 */
export function getSenderAddress(tx: FrozenTx): Address {
  const signer = getSignerForTx(tx)
  const txManager = createTxManagerFromTx(tx)
  return sender(signer, txManager)
}

/**
 * Determines if the signature is valid.
 */
export function verifySignature(tx: FrozenTx): boolean {
  try {
    getSenderAddress(tx)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serializes the transaction to RLP.
 */
export function serialize(tx: FrozenTx): Uint8Array {
  return RLP.encode(tx.inner.raw())
}

/**
 * Computes the transaction hash (only for signed transactions).
 * Equivalent to Go's Transaction.Hash().
 */
export function hash(tx: FrozenTx): Uint8Array {
  if (!isSigned(tx)) {
    throw new Error('Cannot hash unsigned transaction')
  }

  if (Object.isFrozen(tx) && tx.cache.hash !== undefined) {
    return tx.cache.hash
  }

  const txHash = keccak256(serialize(tx))

  if (Object.isFrozen(tx)) {
    ;(tx.cache as { hash?: Uint8Array }).hash = txHash
  }

  return txHash
}

// ============================================================================
// Gas Calculations
// ============================================================================

/**
 * Checks if the transaction targets the creation address (contract deployment).
 */
export function toCreationAddress(tx: FrozenTx): boolean {
  return tx.inner.to === undefined || tx.inner.to.bytes.length === 0
}

/**
 * The amount of gas paid for the data in this tx.
 */
export function getDataGas(tx: FrozenTx): bigint {
  const hardfork = tx.fork
  if (tx.cache.dataFee && (tx.cache.dataFee as any).hardfork === hardfork) {
    return (tx.cache.dataFee as any).value
  }

  const txDataZero = tx.common.getParamAtHardfork('txDataZeroGas', hardfork)!
  const txDataNonZero = tx.common.getParamAtHardfork(
    'txDataNonZeroGas',
    hardfork,
  )!

  let cost = BIGINT_0
  for (let i = 0; i < tx.inner.data.length; i++) {
    tx.inner.data[i] === 0 ? (cost += txDataZero) : (cost += txDataNonZero)
  }

  if (
    (tx.inner.to === undefined || tx.inner.to === null) &&
    tx.common.isEIPActiveAtHardfork(3860, hardfork)
  ) {
    const dataLength = BigInt(Math.ceil(tx.inner.data.length / 32))
    const initCodeCost =
      tx.common.getParamAtHardfork('initCodeWordGas', hardfork)! * dataLength
    cost += initCodeCost
  }

  if (Object.isFrozen(tx)) {
    ;(tx.cache as any).dataFee = { value: cost, hardfork }
  }

  return cost
}

/**
 * The minimum gas limit which the tx must have to be valid.
 */
export function getIntrinsicGas(tx: FrozenTx): bigint {
  const hardfork = tx.fork
  const txFee = tx.common.getParamAtHardfork('txGas', hardfork)!
  let fee = getDataGas(tx)
  if (txFee) fee += txFee

  let isContractCreation = false
  try {
    isContractCreation = toCreationAddress(tx)
  } catch {
    isContractCreation = false
  }

  if (
    tx.common.hardforkGte(Hardfork.Homestead, hardfork) &&
    isContractCreation
  ) {
    const txCreationFee = tx.common.getParamAtHardfork(
      'txCreationGas',
      hardfork,
    )!
    if (txCreationFee) fee += txCreationFee
  }

  return fee
}

/**
 * The up front amount that an account must have for this transaction to be valid.
 */
export function getUpfrontCost(tx: FrozenTx, _baseFee?: bigint): bigint {
  return tx.inner.gasLimit * tx.inner.gasPrice() + tx.inner.value
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates the transaction and returns any encountered errors.
 */
export function getValidationErrors(tx: FrozenTx): string[] {
  const errors: string[] = []
  const hardfork = tx.fork

  if (isSigned(tx) && !verifySignature(tx)) {
    errors.push('Invalid Signature')
  }

  let intrinsicGas = getIntrinsicGas(tx)
  if (tx.common.isEIPActiveAtHardfork(7623, hardfork)) {
    let tokens = 0
    for (let i = 0; i < tx.inner.data.length; i++) {
      tokens += tx.inner.data[i] === 0 ? 1 : 4
    }
    const floorCost =
      tx.common.getParamAtHardfork('txGas', hardfork)! +
      tx.common.getParamAtHardfork('totalCostFloorPerToken', hardfork)! *
        BigInt(tokens)
    intrinsicGas = bigIntMax(intrinsicGas, floorCost)
  }

  if (intrinsicGas > tx.inner.gasLimit) {
    errors.push(
      `gasLimit is too low. Minimum: ${getIntrinsicGas(tx)}, got: ${tx.inner.gasLimit}`,
    )
  }

  return errors
}

/**
 * Returns true if the transaction is valid.
 */
export function isValid(tx: FrozenTx): boolean {
  return getValidationErrors(tx).length === 0
}

// ============================================================================
// JSON Conversion
// ============================================================================

/**
 * Returns an object with the JSON representation of the transaction.
 */
export function toJSON(tx: FrozenTx): JSONTx {
  return {
    type: bigIntToHex(BigInt(tx.inner.type)),
    nonce: bigIntToHex(tx.inner.nonce),
    gasLimit: bigIntToHex(tx.inner.gasLimit),
    gasPrice: bigIntToHex(tx.inner.gasPrice()),
    to: tx.inner.to?.toString(),
    value: bigIntToHex(tx.inner.value),
    data: bytesToHex(tx.inner.data),
    v: tx.inner.v !== undefined ? bigIntToHex(tx.inner.v) : undefined,
    r: tx.inner.r !== undefined ? bigIntToHex(tx.inner.r) : undefined,
    s: tx.inner.s !== undefined ? bigIntToHex(tx.inner.s) : undefined,
    chainId: bigIntToHex(tx.common.chainId()),
  }
}

/**
 * Builds a compact string that summarizes common transaction fields.
 */
export function errorStr(tx: FrozenTx): string {
  let hashStr = ''
  try {
    hashStr = isSigned(tx) ? bytesToHex(hash(tx)) : 'not available (unsigned)'
  } catch {
    hashStr = 'error'
  }

  return `tx type=${tx.inner.type} hash=${hashStr} nonce=${tx.inner.nonce} value=${tx.inner.value} signed=${isSigned(tx)} hf=${tx.fork}`
}
