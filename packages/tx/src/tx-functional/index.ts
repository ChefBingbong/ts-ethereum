// Types
export type {
  AccessListBytes,
  CreateTxOptions,
  FrozenTransaction,
  JSONRPCTx,
  JSONTx,
  TransactionManager,
  TxData,
  TxValuesArray,
  TypedTxData,
} from './types'

// Note: TransactionType and Capability are exported from main types.ts, not re-exported here
// to avoid shadowing the value exports

// Compatibility helpers
export { toFrozenTransaction } from './compat'
// Creator functions (lower-level, return FrozenTransaction)
export {
  fromBytesArray,
  fromRLP,
  fromRPC,
  fromTxData,
} from './creators'

// Pure helper functions (for direct use with FrozenTransaction)
export {
  effectiveGasPrice,
  getAccessList,
  getAuthorizationList,
  getBlobVersionedHashes,
  getChainId,
  getData,
  getDataGas,
  getEffectivePriorityFee,
  getGasLimit,
  getGasPrice,
  // Serialization
  getHash,
  getHashedMessageToSign,
  // Gas
  getIntrinsicGas,
  getMaxFeePerBlobGas,
  getMaxFeePerGas,
  getMaxPriorityFeePerGas,
  getMessageToSign,
  // Accessors
  getNonce,
  getSenderAddress,
  getTo,
  getTxType,
  getUpfrontCost,
  getValidationErrors,
  getValue,
  isEIPActive,
  // Signature
  isSigned,
  // Validation
  isValid,
  numBlobs,
  raw,
  serialize,
  // Capabilities
  supports,
  toJSON,
  verifySignature,
} from './helpers'
// Factory functions (manager pattern)
export { createTransactionManager } from './transaction-manager'
// TxData implementations
export {
  AccessListTxData,
  BlobTxData,
  DynamicFeeTxData,
  EOACodeTxData,
  LegacyTxData,
} from './tx-data'
