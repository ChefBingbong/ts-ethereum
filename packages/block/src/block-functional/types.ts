import type {
  AllParamNames,
  HardforkManager,
  ParamType,
} from '@ts-ethereum/chain-config'
import type { TypedTransaction } from '@ts-ethereum/tx'
import type { Withdrawal } from '@ts-ethereum/utils'
import type {
  BlockHeaderManager,
  FrozenBlockHeader,
} from '../header-functional'
import type {
  BlockBytes,
  BlockOptions,
  ExecutionPayload,
  JSONBlock,
} from '../types'

// Re-export BlockBytes for use in block-manager
export type { BlockBytes }

/**
 * Immutable block state containing validated data and computed caches.
 */
export interface FrozenBlock {
  readonly header: FrozenBlockHeader
  readonly transactions: readonly TypedTransaction[]
  readonly uncleHeaders: readonly FrozenBlockHeader[]
  readonly withdrawals?: readonly Withdrawal[]
  readonly hardforkManager: HardforkManager
  readonly _cache: {
    readonly txTrieRoot: Uint8Array | undefined
    readonly withdrawalsTrieRoot: Uint8Array | undefined
    readonly hash: Uint8Array | undefined
  }
}

/**
 * Options for creating a block.
 */
export interface CreateBlockOptions extends BlockOptions {
  readonly calcDifficultyFromHeader?: BlockHeaderManager
}

/**
 * Immutable block manager interface.
 * Provides a purely functional API for working with blocks.
 * Also includes convenience properties for backward compatibility with the old Block class.
 */
export interface BlockManager {
  readonly block: FrozenBlock

  // Backward compatibility properties (matching old Block class)
  readonly header: BlockHeaderManager
  readonly transactions: readonly TypedTransaction[]
  readonly uncleHeaders: readonly BlockHeaderManager[]
  readonly withdrawals?: readonly Withdrawal[]
  readonly hardforkManager: HardforkManager

  // EIP helpers
  isEIPActive(eip: number): boolean
  param<P extends AllParamNames>(name: P): ParamType<P> | undefined

  // Hardfork access
  readonly hardfork: string

  // Serialization
  raw(): BlockBytes
  hash(): Uint8Array
  serialize(): Uint8Array
  toJSON(): JSONBlock
  toExecutionPayload(): ExecutionPayload

  // Validation
  transactionsAreValid(): boolean
  getTransactionsValidationErrors(): string[]
  transactionsTrieIsValid(): Promise<boolean>
  uncleHashIsValid(): boolean
  withdrawalsTrieIsValid(): Promise<boolean>
  validateData(
    onlyHeader?: boolean,
    verifyTxs?: boolean,
    validateBlockSize?: boolean,
  ): Promise<void>
  validateBlobTransactions(parentHeader: BlockHeaderManager): void
  validateUncles(): void
  validateGasLimit(parentBlock: BlockManager): void

  // Utility
  isGenesis(): boolean
  errorStr(): string

  // Async helpers
  genTxTrie(): Promise<Uint8Array>
}
