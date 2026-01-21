// ============================================================================
// NEW FUNCTIONAL API (Primary - use this for new code)
// ============================================================================

// Re-export functional module (excluding names that conflict with old API)
export {
  // Helper functions
  errorStr,
  getAccessListGas,
  getAuthorizationListGas,
  getDataGas,
  getEffectiveGasPrice,
  getIntrinsicGas,
  getSenderAddress,
  getUpfrontCost,
  getValidationErrors,
  hash,
  // TxManager type guards
  isAccessListCompatibleTxManager,
  isAccessListTxManager,
  isBlobTxManager,
  isEOACodeTxManager,
  isFeeMarketCompatibleTxManager,
  isFeeMarketTxManager,
  isLegacyTxManager,
  // Go-style type checks
  isProtected,
  isProtectedV,
  isSigned,
  isTypedTransaction,
  isValid,
  serialize,
  supports,
  supportsAccessList,
  supportsFeeMarket,
  toCreationAddress,
  toJSON,
  verifySignature,
  // Factory functions
  createTxManager,
  createTxManagerFromBlockBodyData,
  createTxManagerFromJSONRPCProvider,
  createTxManagerFromRLP,
  createTxManagerFromRPC,
  createAccessListTxManager,
  createAccessListTxManagerFromRLP,
  createBlobTxManager,
  createBlobTxManagerFromRLP,
  createDynamicFeeTxManager,
  createDynamicFeeTxManagerFromRLP,
  createLegacyTxManager,
  createLegacyTxManagerFromBytesArray,
  createLegacyTxManagerFromRLP,
  createSetCodeTxManager,
  createSetCodeTxManagerFromRLP,
  // Signer factory functions
  latestSigner,
  latestSignerForChainID,
  makeSigner,
  // Signer implementations
  CancunSigner,
  EIP155Signer,
  EIP2930Signer,
  FrontierSigner,
  HomesteadSigner,
  LondonSigner,
  PragueSigner,
  // Go-style signing functions
  Sender,
  SignTx,
  sender,
  signTx,
  // Transaction data implementations (new functional API)
  AccessListTxData,
  BlobTxData,
  DynamicFeeTxData,
  LegacyTxData,
  SetCodeTxData,
  // Transaction manager functions
  createTxManagerFromTx,
  newTx,
} from './tx-functional.ts/index'

// Export new types with functional prefix to avoid conflicts
export type {
  FrozenTx,
  Signer,
  TxData as FunctionalTxData,
  TxManager,
} from './tx-functional.ts/types'

// Export BlobTxSidecar type
export type { BlobTxSidecar } from './tx-functional.ts/tx-blob'

// ============================================================================
// OLD CLASS-BASED API (Deprecated - kept for backward compatibility)
// ============================================================================

// Tx class constructors (deprecated - use functional factories instead)
export * from './1559/index'
export * from './2930/index'
export * from './4844/index'
export * from './7702/index'
export * from './legacy/index'

// Parameters
export * from './params'

// Old transaction factory (deprecated - use createTxManager instead)
export {
  createTx,
  createTxFromBlockBodyData,
  createTxFromJSONRPCProvider,
  createTxFromRLP,
  createTxFromRPC,
} from './transactionFactory'

// Types (includes both old and new type definitions)
export * from './types'

// Utils
export * from './util/index'
