// Export block-functional as the main block implementation
// Backward compatibility: Block type alias
export type {
  BlockManager as Block,
  BlockManager,
  CreateBlockOptions,
  FrozenBlock,
} from './block-functional'

// Export block-functional creators and managers (block-specific exports)
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
  createEmpty,
  createSealedClique,
  // Block-specific helpers
  errorStr,
  fromBlockData,
  fromExecutionPayload,
  fromJSONRPCProvider,
  genTxTrie,
  getTransactionsValidationErrors,
  toExecutionPayload,
  transactionsAreValid,
  transactionsTrieIsValid,
  uncleHashIsValid,
  validateBlobTransactions,
  validateData,
  validateGasLimit,
  validateUncles,
  withdrawalsTrieIsValid,
} from './block-functional'

export * from './builder'
export * from './consensus'
export * from './header-functional'
export * from './helpers'
export * from './types'
export * from './validation'

import type { BlockManager } from './block-functional'
import type { BlockHeader } from './types'

/**
 * Type guard to check if an object is a BlockManager (has a `block` property)
 * This replaces the old `instanceof Block` checks since Block is now a functional interface
 */
export function isBlock(
  item: BlockManager | BlockHeader,
): item is BlockManager {
  if (typeof item !== 'object' || item === null) {
    return false
  }
  // BlockManager has a 'block' property, BlockHeaderManager doesn't
  return 'block' in item && 'transactions' in item
}
