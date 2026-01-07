// Types

// Factory functions (manager pattern)
export {
  createBlockManagerCreateEmpty,
  createBlockManagerCreateSealedClique,
  createBlockManagerFromBlock,
  createBlockManagerFromBlockData,
  createBlockManagerFromBytes,
  createBlockManagerFromExecutionPayload,
  createBlockManagerFromHeader,
  createBlockManagerFromJSONRPCProvider,
  createBlockManagerFromRLP,
  createBlockManagerFromRPC,
} from './block-manager'

// Creator functions (lower-level, return FrozenBlock)
export {
  createEmpty,
  createSealedClique,
  fromBlockData,
  fromBytesArray,
  fromExecutionPayload,
  fromJSONRPCProvider,
  fromRLP,
  fromRPC,
} from './creators'
// Pure helper functions (for direct use with FrozenBlock)
export {
  // Getters
  errorStr,
  // Trie helpers
  genTxTrie,
  getHardfork,
  // Serialization
  getHash,
  getParam,
  getTransactionsValidationErrors,
  isEIPActive,
  isGenesis,
  serialize,
  toExecutionPayload,
  toJSON,
  toRaw,
  // Validation
  transactionsAreValid,
  transactionsTrieIsValid,
  uncleHashIsValid,
  validateBlobTransactions,
  validateData,
  validateGasLimit,
  validateUncles,
  withdrawalsTrieIsValid,
} from './helpers'
export type {
  BlockManager,
  CreateBlockOptions,
  FrozenBlock,
} from './types'
