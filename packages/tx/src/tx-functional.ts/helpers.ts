import { Hardfork } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  Address,
  BIGINT_0,
  BIGINT_2,
  bigIntMax,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  ecrecover,
  publicToAddress,
  SECP256K1_ORDER_DIV_2,
  toBytes,
  unpadBytes,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { Capability, type JSONTx, TransactionType } from '../types'
import { createTxManagerFromTx } from './tx-manager'
import type { FrozenTx, TxManager } from './types'

// ============================================================================
// Capability Support
// ============================================================================

/**
 * Checks if a capability is supported based on the frozen tx's activeCapabilities.
 */
export function supports(tx: FrozenTx, capability: Capability): boolean {
  return tx.activeCapabilities?.includes(capability) ?? false
}

// ============================================================================
// Signature Helpers
// ============================================================================

/**
 * Checks if a transaction is signed
 */
export function isSigned(tx: FrozenTx): boolean {
  const { v, r, s } = tx.inner
  return v !== undefined && r !== undefined && s !== undefined
}

/**
 * Validates the S value per EIP-2 (Homestead rule)
 */
function validateHighS(tx: FrozenTx): void {
  const { s } = tx.inner
  if (
    tx.common.hardforkGte(Hardfork.Homestead, tx.fork) &&
    s !== undefined &&
    s > SECP256K1_ORDER_DIV_2
  ) {
    throw new Error(
      'Invalid Signature: s-values greater than secp256k1n/2 are considered invalid',
    )
  }
}

/**
 * Recovers the sender's public key from the transaction signature.
 */
export function getSenderPublicKey(tx: FrozenTx): Uint8Array {
  if (tx.cache.senderPubKey !== undefined) {
    return tx.cache.senderPubKey
  }

  const msgHash = getMessageToVerifySignature(tx)
  const { v, r, s } = tx.inner

  validateHighS(tx)

  try {
    const sender = ecrecover(
      msgHash,
      v!,
      bigIntToUnpaddedBytes(r!),
      bigIntToUnpaddedBytes(s!),
      supports(tx, Capability.EIP155ReplayProtection)
        ? tx.common.chainId()
        : undefined,
    )
    if (Object.isFrozen(tx)) {
      ;(tx.cache as any).senderPubKey = sender
    }
    return sender
  } catch {
    throw new Error('Invalid Signature')
  }
}

/**
 * Returns the sender's address
 */
export function getSenderAddress(tx: FrozenTx): Address {
  return new Address(publicToAddress(getSenderPublicKey(tx), false))
}

/**
 * Determines if the signature is valid
 */
export function verifySignature(tx: FrozenTx): boolean {
  try {
    const publicKey = getSenderPublicKey(tx)
    return unpadBytes(publicKey).length !== 0
  } catch {
    return false
  }
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serializes the transaction
 */
export function serialize(tx: FrozenTx): Uint8Array {
  return RLP.encode(tx.inner.raw())
}

/**
 * Returns the message to sign (unsigned tx fields)
 */
export function getMessageToSign(tx: FrozenTx): Uint8Array | Uint8Array[] {
  if (tx.inner.type === TransactionType.Legacy) {
    const supportsEIP155 = supports(tx, Capability.EIP155ReplayProtection)
    return tx.inner.getMessageToSign(tx.common.chainId(), supportsEIP155)
  }
  // For typed transactions, return the serialized form
  return serialize(tx)
}

/**
 * Returns the hashed message to sign
 */
export function getHashedMessageToSign(tx: FrozenTx): Uint8Array {
  if (tx.inner.type === TransactionType.Legacy) {
    const message = getMessageToSign(tx) as Uint8Array[]
    return keccak256(RLP.encode(message))
  }
  return keccak256(getMessageToSign(tx) as Uint8Array)
}

/**
 * Computes a sha3-256 hash which can be used to verify the signature
 */
export function getMessageToVerifySignature(tx: FrozenTx): Uint8Array {
  if (!isSigned(tx)) {
    throw new Error('Transaction is not signed')
  }
  return getHashedMessageToSign(tx)
}

/**
 * Computes the transaction hash (only for signed transactions)
 */
export function hash(tx: FrozenTx): Uint8Array {
  if (!isSigned(tx)) {
    throw new Error('Cannot call hash method if transaction is not signed')
  }

  if (Object.isFrozen(tx) && tx.cache.hash !== undefined) {
    return tx.cache.hash
  }

  const txHash = keccak256(serialize(tx))

  if (Object.isFrozen(tx)) {
    ;(tx.cache as any).hash = txHash
  }

  return txHash
}

// ============================================================================
// Gas Calculations
// ============================================================================

/**
 * Checks if the transaction targets the creation address (contract deployment)
 */
export function toCreationAddress(tx: FrozenTx): boolean {
  return tx.inner.to === undefined || tx.inner.to.bytes.length === 0
}

/**
 * The amount of gas paid for the data in this tx
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
    ;(tx.cache as any).dataFee = {
      value: cost,
      hardfork: hardfork,
    }
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
 * The up front amount that an account must have for this transaction to be valid
 */
export function getUpfrontCost(tx: FrozenTx, baseFee?: bigint): bigint {
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
      `gasLimit is too low. The gasLimit is lower than the minimum gas limit of ${getIntrinsicGas(tx)}, the gas limit is: ${tx.inner.gasLimit}`,
    )
  }

  return errors
}

/**
 * Returns true if the transaction is valid
 */
export function isValid(tx: FrozenTx): boolean {
  return getValidationErrors(tx).length === 0
}

// ============================================================================
// Signing
// ============================================================================

/**
 * Signs a transaction with the provided private key.
 */
export function sign(
  tx: FrozenTx,
  privateKey: Uint8Array,
  extraEntropy: Uint8Array | boolean = true,
): TxManager {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes in length.')
  }

  const msgHash = getHashedMessageToSign(tx)
  const { recovery, r, s } = secp256k1.sign(msgHash, privateKey, {
    extraEntropy,
  })

  if (recovery === undefined) {
    throw new Error('Invalid signature recovery')
  }

  return addSignature(tx, BigInt(recovery), r, s, true)
}

/**
 * Adds a signature to the transaction and returns a new TxManager.
 */
export function addSignature(
  tx: FrozenTx,
  v: bigint,
  r: Uint8Array | bigint,
  s: Uint8Array | bigint,
  convertV = false,
): TxManager {
  const rBytes = toBytes(r)
  const sBytes = toBytes(s)

  let finalV = v
  if (convertV && supports(tx, Capability.EIP155ReplayProtection)) {
    finalV = v + 35n + tx.common.chainId() * BIGINT_2
  } else if (convertV) {
    finalV = v + 27n
  }

  const newTxData = tx.inner.setSignatureValues(
    tx.common.chainId(),
    finalV,
    bytesToBigInt(rBytes),
    bytesToBigInt(sBytes),
  )

  const newFrozenTx: FrozenTx = {
    inner: newTxData,
    common: tx.common,
    fork: tx.fork,
    cache: {},
    txOptions: tx.txOptions,
    activeCapabilities: tx.activeCapabilities,
  }

  return createTxManagerFromTx(newFrozenTx)
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
 * Builds a compact string that summarizes common transaction fields for error messages.
 */
export function errorStr(tx: FrozenTx): string {
  let hashStr = ''
  try {
    hashStr = isSigned(tx) ? bytesToHex(hash(tx)) : 'not available (unsigned)'
  } catch {
    hashStr = 'error'
  }
  let isSignedStr = ''
  try {
    isSignedStr = isSigned(tx).toString()
  } catch {
    isSignedStr = 'error'
  }
  let hf = ''
  try {
    hf = tx.fork
  } catch {
    hf = 'error'
  }

  let postfix = `tx type=${tx.inner.type} hash=${hashStr} nonce=${tx.inner.nonce} value=${tx.inner.value} `
  postfix += `signed=${isSignedStr} hf=${hf}`

  return postfix
}
