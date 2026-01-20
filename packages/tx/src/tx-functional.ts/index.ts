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

// Core types
export type { FrozenTx, TxData, TxManager, Signer } from './types'

// Transaction data implementations
export { LegacyTxData } from './tx-legacy'

// Transaction manager functions
export { newTx, createTxManagerFromTx } from './tx-manager'

// Go-style signing functions
export { signTx, sender, SignTx, Sender } from './signing'

// Signer implementations
export {
  FrontierSigner,
  HomesteadSigner,
  EIP155Signer,
  EIP2930Signer,
  LondonSigner,
  CancunSigner,
  PragueSigner,
} from './signer/signers'

// Signer factory functions
export {
  makeSigner,
  latestSigner,
  latestSignerForChainID,
} from './signer/signer-factory'

// Helper functions
export {
  // Go-style type checks (preferred)
  isProtected,
  isProtectedV,
  isTypedTransaction,
  supportsFeeMarket,
  supportsAccessList,
  // Legacy capability check (deprecated)
  supports,
  // Signature helpers
  isSigned,
  getSenderAddress,
  verifySignature,
  // Serialization
  serialize,
  hash,
  // Gas calculations
  toCreationAddress,
  getDataGas,
  getIntrinsicGas,
  getUpfrontCost,
  // Validation
  getValidationErrors,
  isValid,
  // JSON
  toJSON,
  errorStr,
} from './helpers'
