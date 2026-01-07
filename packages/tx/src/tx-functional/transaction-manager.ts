import type {
  Capability,
  JSONTx,
  TxValuesArray,
} from '../types'
import type { FrozenTransaction, TransactionManager } from './types'
import {
  getChainId,
  getData,
  getGasLimit,
  getGasPrice,
  getMaxFeePerGas,
  getMaxPriorityFeePerGas,
  getNonce,
  getTo,
  getTxType,
  getValue,
} from './helpers/accessors'
import {
  getHash,
  raw,
  serialize,
  toJSON,
} from './helpers/serialization'
import {
  getHashedMessageToSign,
  getMessageToSign,
  getSenderAddress,
  isSigned,
  verifySignature,
} from './helpers/signature'
import {
  effectiveGasPrice,
  getDataGas,
  getIntrinsicGas,
  getUpfrontCost,
} from './helpers/gas'
import { getValidationErrors, isValid } from './helpers/validation'
import { isEIPActive, supports } from './helpers/capabilities'

/**
 * Creates a TransactionManager from a FrozenTransaction.
 * Provides a convenient functional API for working with transactions.
 */
export function createTransactionManager(
  transaction: FrozenTransaction,
): TransactionManager {
  return Object.freeze({
    transaction,

    // Accessors
    nonce: () => getNonce(transaction),
    gasLimit: () => getGasLimit(transaction),
    value: () => getValue(transaction),
    data: () => getData(transaction),
    to: () => getTo(transaction),
    chainId: () => getChainId(transaction),
    gasPrice: () => getGasPrice(transaction),
    maxPriorityFeePerGas: () => getMaxPriorityFeePerGas(transaction),
    maxFeePerGas: () => getMaxFeePerGas(transaction),
    maxFeePerBlobGas: () => {
      const txType = getTxType(transaction)
      if (txType === 3) {
        // Blob transaction
        const blobTx = transaction.inner as any
        return blobTx.maxFeePerBlobGas
      }
      return undefined
    },
    blobVersionedHashes: () => {
      const txType = getTxType(transaction)
      if (txType === 3) {
        // Blob transaction
        const blobTx = transaction.inner as any
        return blobTx.blobVersionedHashes
      }
      return undefined
    },
    authorizationList: () => {
      const txType = getTxType(transaction)
      if (txType === 4) {
        // EOA Code transaction
        const eoaTx = transaction.inner as any
        return eoaTx.authorizationList
      }
      return undefined
    },

    // Transaction type
    type: () => getTxType(transaction),

    // Signature
    isSigned: () => isSigned(transaction),
    getSenderAddress: () => getSenderAddress(transaction),
    verifySignature: () => verifySignature(transaction),
    getMessageToSign: () => getMessageToSign(transaction),
    getHashedMessageToSign: () => getHashedMessageToSign(transaction),

    // Serialization
    hash: () => getHash(transaction),
    serialize: () => serialize(transaction),
    raw: () => raw(transaction),
    toJSON: () => toJSON(transaction),

    // Gas calculations
    getIntrinsicGas: () => getIntrinsicGas(transaction),
    getDataGas: () => getDataGas(transaction),
    getUpfrontCost: () => getUpfrontCost(transaction),
    effectiveGasPrice: (baseFee?: bigint) =>
      effectiveGasPrice(transaction, baseFee),

    // Validation
    isValid: () => isValid(transaction),
    getValidationErrors: () => getValidationErrors(transaction),

    // Capabilities
    supports: (capability: Capability) => supports(transaction, capability),

    // Utility
    toCreationAddress: () => {
      const to = getTo(transaction)
      return to === undefined || to.bytes.length === 0
    },
  })
}

