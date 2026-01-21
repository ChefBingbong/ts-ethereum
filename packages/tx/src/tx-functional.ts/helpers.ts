import { Hardfork } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  type Address,
  BIGINT_0,
  bigIntMax,
  bigIntToHex,
  bytesToHex,
  concatBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import type { AccessListBytes } from '../types'
import { Capability, type JSONTx, TransactionType } from '../types'
import { makeSigner } from './signer/signer-factory'
import { sender } from './signing'
import type { AccessListTxData } from './tx-access-list'
import type { BlobTxData } from './tx-blob'
import type { DynamicFeeTxData } from './tx-dynamic-fee'
import { createTxManagerFromTx } from './tx-manager'
import type { SetCodeTxData } from './tx-set-code'
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
 * Returns the appropriate signer for the transaction based on its hardfork context.
 */
function getSignerForTx(tx: FrozenTx): Signer {
  // Use the transaction's fork context to get the correct signer
  return makeSigner(tx.common, undefined, undefined, tx.fork)
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
 * Serializes the transaction to bytes.
 * For legacy transactions: RLP encode directly
 * For typed transactions (EIP-2718): type byte || RLP([...])
 */
export function serialize(tx: FrozenTx): Uint8Array {
  if (tx.inner.type === TransactionType.Legacy) {
    // Legacy transactions are just RLP encoded
    return RLP.encode(tx.inner.raw())
  }

  // Typed transactions (EIP-2718): type byte prefix + RLP encoded data
  const encoded = RLP.encode(tx.inner.raw())
  return concatBytes(new Uint8Array([tx.inner.type]), encoded)
}

/**
 * Computes the transaction hash (only for signed transactions).
 * Equivalent to Go's Transaction.Hash().
 *
 * For legacy transactions: keccak256(rlp([...]))
 * For typed transactions: keccak256(type || rlp([...]))
 */
export function hash(tx: FrozenTx): Uint8Array {
  if (!isSigned(tx)) {
    throw new Error('Cannot hash unsigned transaction')
  }

  if (Object.isFrozen(tx) && tx.cache.hash !== undefined) {
    return tx.cache.hash
  }

  // serialize() already handles the type byte prefix for typed transactions
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
 * Calculates the gas cost for an access list.
 * EIP-2930: ACCESS_LIST_ADDRESS_COST (2400) per address + ACCESS_LIST_STORAGE_KEY_COST (1900) per key
 */
export function getAccessListGas(
  accessList: AccessListBytes | null,
  tx: FrozenTx,
): bigint {
  if (!accessList || accessList.length === 0) {
    return BIGINT_0
  }

  const hardfork = tx.fork
  const accessListAddressCost =
    tx.common.getParamAtHardfork('accessListAddressGas', hardfork) ?? 2400n
  const accessListStorageKeyCost =
    tx.common.getParamAtHardfork('accessListStorageKeyGas', hardfork) ?? 1900n

  let cost = BIGINT_0
  for (const [_address, storageKeys] of accessList) {
    cost += accessListAddressCost
    cost += accessListStorageKeyCost * BigInt(storageKeys.length)
  }

  return cost
}

/**
 * Calculates the gas cost for an authorization list (EIP-7702).
 * PER_AUTH_BASE_COST per authorization entry.
 */
export function getAuthorizationListGas(tx: FrozenTx): bigint {
  if (tx.inner.type !== TransactionType.EOACodeEIP7702) {
    return BIGINT_0
  }

  const setCodeTx = tx.inner as unknown as SetCodeTxData
  if (
    !setCodeTx.authorizationList ||
    setCodeTx.authorizationList.length === 0
  ) {
    return BIGINT_0
  }

  const hardfork = tx.fork
  // EIP-7702: PER_AUTH_BASE_COST = 2500
  const perAuthBaseCost =
    tx.common.getParamAtHardfork('perAuthBaseGas', hardfork) ?? 2500n

  return perAuthBaseCost * BigInt(setCodeTx.authorizationList.length)
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
    tx.common.hardforkGte(hardfork, Hardfork.Homestead) &&
    isContractCreation
  ) {
    const txCreationFee = tx.common.getParamAtHardfork(
      'txCreationGas',
      hardfork,
    )!
    if (txCreationFee) fee += txCreationFee
  }

  // Add access list gas for typed transactions
  if (supportsAccessList(tx)) {
    const accessList = tx.inner.accessList()
    fee += getAccessListGas(accessList, tx)
  }

  // Add authorization list gas for EIP-7702 transactions
  fee += getAuthorizationListGas(tx)

  return fee
}

/**
 * The up front amount that an account must have for this transaction to be valid.
 * For EIP-1559 txs: gasLimit * maxFeePerGas + value
 * For blob txs: gasLimit * maxFeePerGas + blobGas * maxFeePerBlobGas + value
 */
export function getUpfrontCost(tx: FrozenTx, baseFee?: bigint): bigint {
  let cost = tx.inner.gasLimit * tx.inner.gasFeeCap() + tx.inner.value

  // For blob transactions, add blob gas cost
  if (tx.inner.type === TransactionType.BlobEIP4844) {
    const blobTx = tx.inner as unknown as BlobTxData
    cost += blobTx.blobGas() * blobTx.maxFeePerBlobGas
  }

  return cost
}

/**
 * Returns the effective gas price for the transaction given the block base fee.
 * For legacy/access list txs: gasPrice
 * For EIP-1559 txs: min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
 */
export function getEffectiveGasPrice(tx: FrozenTx, baseFee?: bigint): bigint {
  return tx.inner.effectiveGasPrice(baseFee)
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
 * Converts access list bytes to JSON format.
 */
function accessListToJSON(
  accessList: AccessListBytes | null,
): Array<{ address: string; storageKeys: string[] }> | undefined {
  if (!accessList || accessList.length === 0) {
    return undefined
  }

  return accessList.map(([address, storageKeys]) => ({
    address: bytesToHex(address),
    storageKeys: storageKeys.map((key) => bytesToHex(key)),
  }))
}

/**
 * Returns an object with the JSON representation of the transaction.
 */
export function toJSON(tx: FrozenTx): JSONTx {
  const base: JSONTx = {
    type: bigIntToHex(BigInt(tx.inner.type)),
    nonce: bigIntToHex(tx.inner.nonce),
    gasLimit: bigIntToHex(tx.inner.gasLimit),
    to: tx.inner.to?.toString(),
    value: bigIntToHex(tx.inner.value),
    data: bytesToHex(tx.inner.data),
    v: tx.inner.v !== undefined ? bigIntToHex(tx.inner.v) : undefined,
    r: tx.inner.r !== undefined ? bigIntToHex(tx.inner.r) : undefined,
    s: tx.inner.s !== undefined ? bigIntToHex(tx.inner.s) : undefined,
    chainId: bigIntToHex(tx.inner.chainID()),
  }

  // Add type-specific fields
  switch (tx.inner.type) {
    case TransactionType.Legacy:
      base.gasPrice = bigIntToHex(tx.inner.gasPrice())
      break

    case TransactionType.AccessListEIP2930: {
      const accessListTx = tx.inner as unknown as AccessListTxData
      base.gasPrice = bigIntToHex(accessListTx.gasPrice())
      base.accessList = accessListToJSON(accessListTx.accessList())
      break
    }

    case TransactionType.FeeMarketEIP1559: {
      const dynamicFeeTx = tx.inner as unknown as DynamicFeeTxData
      base.maxPriorityFeePerGas = bigIntToHex(dynamicFeeTx.maxPriorityFeePerGas)
      base.maxFeePerGas = bigIntToHex(dynamicFeeTx.maxFeePerGas)
      base.accessList = accessListToJSON(dynamicFeeTx.accessList())
      break
    }

    case TransactionType.BlobEIP4844: {
      const blobTx = tx.inner as unknown as BlobTxData
      base.maxPriorityFeePerGas = bigIntToHex(blobTx.maxPriorityFeePerGas)
      base.maxFeePerGas = bigIntToHex(blobTx.maxFeePerGas)
      base.maxFeePerBlobGas = bigIntToHex(blobTx.maxFeePerBlobGas)
      base.accessList = accessListToJSON(blobTx.accessList())
      base.blobVersionedHashes = blobTx.blobVersionedHashes
      break
    }

    case TransactionType.EOACodeEIP7702: {
      const setCodeTx = tx.inner as unknown as SetCodeTxData
      base.maxPriorityFeePerGas = bigIntToHex(setCodeTx.maxPriorityFeePerGas)
      base.maxFeePerGas = bigIntToHex(setCodeTx.maxFeePerGas)
      base.accessList = accessListToJSON(setCodeTx.accessList())
      // authorizationList would need special handling - skipping for now
      break
    }
  }

  return base
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
