import {
  Capability,
  type Transaction,
  TransactionType,
  type TxOptions,
  type TxValuesArray,
} from '../types'
import * as helpers from './helpers'
import type { FrozenTx, TxData, TxManager } from './types'

/**
 * Calculates the active capabilities for a transaction based on its type,
 * signature state, and hardfork configuration.
 */
function getActiveCapabilities(
  txData: TxData,
  fork: string,
  common: TxOptions['common'],
): number[] {
  const capabilities: number[] = []

  if (txData.type === TransactionType.Legacy) {
    // For legacy transactions, EIP-155 replay protection depends on:
    // 1. If unsigned: hardfork must support it (>= spuriousDragon)
    // 2. If signed: v >= 37 indicates EIP-155 was used
    const isSigned =
      txData.v !== undefined && txData.r !== undefined && txData.s !== undefined

    if (!isSigned) {
      // For unsigned txs: only enable EIP-155 if hardfork supports it
      if (common.hardforkGte(fork, 'spuriousDragon')) {
        capabilities.push(Capability.EIP155ReplayProtection)
      }
    } else {
      // For signed txs: detect if tx was signed with EIP-155 (v >= 37)
      const v = txData.v !== undefined ? Number(txData.v) : undefined
      if (v !== undefined && v >= 37) {
        capabilities.push(Capability.EIP155ReplayProtection)
      }
    }
  } else if (txData.type === TransactionType.AccessListEIP2930) {
    capabilities.push(Capability.EIP155ReplayProtection)
    capabilities.push(Capability.EIP2718TypedTransaction)
    capabilities.push(Capability.EIP2930AccessLists)
  } else if (txData.type === TransactionType.FeeMarketEIP1559) {
    capabilities.push(Capability.EIP155ReplayProtection)
    capabilities.push(Capability.EIP2718TypedTransaction)
    capabilities.push(Capability.EIP2930AccessLists)
    capabilities.push(Capability.EIP1559FeeMarket)
  } else if (txData.type === TransactionType.BlobEIP4844) {
    capabilities.push(Capability.EIP155ReplayProtection)
    capabilities.push(Capability.EIP2718TypedTransaction)
    capabilities.push(Capability.EIP2930AccessLists)
    capabilities.push(Capability.EIP1559FeeMarket)
  } else if (txData.type === TransactionType.EOACodeEIP7702) {
    capabilities.push(Capability.EIP155ReplayProtection)
    capabilities.push(Capability.EIP2718TypedTransaction)
    capabilities.push(Capability.EIP2930AccessLists)
    capabilities.push(Capability.EIP1559FeeMarket)
    capabilities.push(Capability.EIP7702EOACode)
  }

  return capabilities
}

/**
 * NewTx creates a new transaction - equivalent to Go's NewTx function
 */
export function newTx(txData: TxData, opts: TxOptions): TxManager {
  const fork = opts.common.getHardforkFromContext(opts.hardfork)
  const activeCapabilities = getActiveCapabilities(txData, fork, opts.common)

  const frozenTx: FrozenTx = {
    inner: txData,
    common: opts.common,
    fork,
    cache: {},
    txOptions: opts,
    activeCapabilities,
  }
  return createTxManagerFromTx(frozenTx)
}

/**
 * Create manager from frozen tx
 */
export function createTxManagerFromTx<T extends TransactionType>(
  tx: FrozenTx,
): TxManager<T> {
  return Object.freeze({
    tx,

    // Accessors matching TransactionInterface
    get common() {
      return tx.common
    },
    get nonce() {
      return tx.inner.nonce
    },
    get gasLimit() {
      return tx.inner.gasLimit
    },
    get to() {
      return tx.inner.to
    },
    get value() {
      return tx.inner.value
    },
    get data() {
      return tx.inner.data
    },
    get v() {
      return tx.inner.v
    },
    get r() {
      return tx.inner.r
    },
    get s() {
      return tx.inner.s
    },
    get cache() {
      return tx.cache
    },
    get fork() {
      return tx.fork
    },
    get type() {
      return tx.inner.type
    },
    get txOptions() {
      return tx.txOptions
    },

    // Methods matching TransactionInterface
    supports: (capability: Capability) => helpers.supports(tx, capability),
    getIntrinsicGas: () => helpers.getIntrinsicGas(tx),
    getDataGas: () => helpers.getDataGas(tx),
    getUpfrontCost: () => helpers.getUpfrontCost(tx),
    toCreationAddress: () => helpers.toCreationAddress(tx),
    raw: () => tx.inner.raw() as TxValuesArray[T],
    serialize: () => helpers.serialize(tx),
    getMessageToSign: () => helpers.getMessageToSign(tx),
    getHashedMessageToSign: () => helpers.getHashedMessageToSign(tx),
    hash: () => helpers.hash(tx),
    getMessageToVerifySignature: () => helpers.getMessageToVerifySignature(tx),
    getValidationErrors: () => helpers.getValidationErrors(tx),
    isSigned: () => helpers.isSigned(tx),
    isValid: () => helpers.isValid(tx),
    verifySignature: () => helpers.verifySignature(tx),
    getSenderAddress: () => helpers.getSenderAddress(tx),
    getSenderPublicKey: () => helpers.getSenderPublicKey(tx),
    sign: (privateKey: Uint8Array, extraEntropy?: Uint8Array | boolean) =>
      helpers.sign(tx, privateKey, extraEntropy) as unknown as Transaction[T],
    toJSON: () => helpers.toJSON(tx),
    errorStr: () => helpers.errorStr(tx),
    addSignature: (
      v: bigint,
      r: Uint8Array | bigint,
      s: Uint8Array | bigint,
      convertV?: boolean,
    ) =>
      helpers.addSignature(tx, v, r, s, convertV) as unknown as Transaction[T],
  })
}
