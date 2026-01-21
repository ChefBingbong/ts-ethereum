/**
 * TX Functional Module - Go-Ethereum style transaction handling
 *
 * This module provides a functional/procedural approach to transaction
 * handling, similar to Go-Ethereum's design:
 *
 * - TxData implementations (LegacyTxData, etc.) are simple data structs
 * - Signers handle all signature-related logic (hash, recovery, V encoding)
 * - TxManager wraps transactions with methods like withSignature()
 *
 * Usage:
 * ```ts
 * import { newTx, signTx, sender, makeSigner, LegacyTxData } from './tx-functional'
 *
 * // Create a transaction
 * const txData = new LegacyTxData({ nonce: 1n, gasPrice: 1000n, ... })
 * const tx = newTx(txData, { common })
 *
 * // Sign using the appropriate signer (Go-style)
 * const signer = makeSigner(common)
 * const signedTx = signTx(tx, signer, privateKey)
 *
 * // Or use withSignature directly (also Go-style)
 * const sig = sign(signer.hash(tx), privateKey)
 * const signedTx = tx.withSignature(signer, sig)
 *
 * // Recover sender
 * const from = sender(signer, signedTx)
 * ```
 */

// Helper functions
export {
  errorStr,
  // Access list gas calculation
  getAccessListGas,
  // Authorization list gas calculation (EIP-7702)
  getAuthorizationListGas,
  getDataGas,
  // Effective gas price calculation
  getEffectiveGasPrice,
  getIntrinsicGas,
  getSenderAddress,
  getUpfrontCost,
  // Validation
  getValidationErrors,
  hash,
  // Go-style type checks (preferred)
  isProtected,
  isProtectedV,
  // Signature helpers
  isSigned,
  isTypedTransaction,
  isValid,
  // Serialization
  serialize,
  // Legacy capability check (deprecated)
  supports,
  supportsAccessList,
  supportsFeeMarket,
  // Gas calculations
  toCreationAddress,
  // JSON
  toJSON,
  verifySignature,
} from './helpers'
// Signer factory functions
export {
  latestSigner,
  latestSignerForChainID,
  makeSigner,
} from './signer/signer-factory'
// Signer implementations
export {
  CancunSigner,
  EIP155Signer,
  EIP2930Signer,
  FrontierSigner,
  HomesteadSigner,
  LondonSigner,
  PragueSigner,
} from './signer/signers'

// Go-style signing functions
export { Sender, SignTx, sender, signTx } from './signing'

// Transaction data implementations
export { LegacyTxData } from './tx-legacy'
export { AccessListTxData } from './tx-access-list'
export { DynamicFeeTxData } from './tx-dynamic-fee'
export { BlobTxData, type BlobTxSidecar } from './tx-blob'
export { SetCodeTxData } from './tx-set-code'

// Transaction manager functions
export { createTxManagerFromTx, newTx } from './tx-manager'
// Core types
export type { FrozenTx, Signer, TxData, TxManager } from './types'
