import type { Block, BlockHeader } from '@ts-ethereum/block'
import type {
  ConsensusAlgorithm,
  GenesisState,
  HardforkManager,
} from '@ts-ethereum/chain-config'
import type { DB, DBObject } from '@ts-ethereum/utils'
import type { EventEmitter } from 'eventemitter3'
import type { DBManager } from '../db/manager'
import type { DBOp } from '../db/operation'

/**
 * Event types emitted by the blockchain
 */
export type BlockchainEvent = {
  deletedCanonicalBlocks: (
    data: Block[],
    resolve?: (result?: any) => void,
  ) => void
}

/**
 * Callback function type for block iteration
 */
export type OnBlock = (block: Block, reorg: boolean) => Promise<void> | void

/**
 * Immutable blockchain configuration.
 * Contains all configuration that doesn't change during the blockchain's lifetime.
 */
export interface FrozenBlockchainConfig {
  readonly hardforkManager: HardforkManager
  readonly genesisBlock: Block
  readonly validateBlocks: boolean
  readonly validateConsensus: boolean
  readonly hardforkByHeadBlockNumber: boolean
  readonly fork: string
  readonly customGenesisState?: GenesisState
}

/**
 * Consensus algorithm dictionary type
 */
export type ConsensusDict = {
  [consensusAlgorithm: ConsensusAlgorithm | string]: Consensus
}

/**
 * Interface that a consensus class needs to implement.
 */
export interface Consensus {
  algorithm: ConsensusAlgorithm | string

  /**
   * Initialize genesis for consensus mechanism
   */
  genesisInit(genesisBlock: Block): Promise<void>

  /**
   * Set up consensus mechanism
   */
  setup(opts: ConsensusOptions): Promise<void>

  /**
   * Validate block consensus parameters
   */
  validateConsensus(block: Block): Promise<void>

  /**
   * Validate block difficulty
   */
  validateDifficulty(header: BlockHeader): Promise<void>

  /**
   * Update consensus on new block
   */
  newBlock(
    block: Block,
    commonAncestor?: BlockHeader,
    ancientHeaders?: BlockHeader[],
  ): Promise<void>
}

/**
 * Options when initializing a consensus implementation
 */
export interface ConsensusOptions {
  blockchain: BlockchainManager
}

/**
 * Options for creating a blockchain
 */
export interface CreateBlockchainOptions {
  /**
   * HardforkManager instance for chain configuration
   */
  hardforkManager: HardforkManager

  /**
   * Optional hardfork identifier or block context
   */
  hardfork?: string | { blockNumber: bigint; timestamp?: bigint }

  /**
   * Update hardfork based on head block number
   */
  hardforkByHeadBlockNumber?: boolean

  /**
   * Database for storing blocks and metadata
   */
  db?: DB<Uint8Array | string | number, Uint8Array | string | DBObject>

  /**
   * Validate blocks on insert
   */
  validateBlocks?: boolean

  /**
   * Validate consensus on insert
   */
  validateConsensus?: boolean

  /**
   * Custom consensus implementations
   */
  consensusDict?: ConsensusDict

  /**
   * Pre-created genesis block
   */
  genesisBlock?: Block

  /**
   * Genesis state for custom chains
   */
  genesisState?: GenesisState

  /**
   * Pre-computed genesis state root
   */
  genesisStateRoot?: Uint8Array
}

/**
 * Result of finding a common ancestor between chains
 */
export interface CommonAncestorResult {
  commonAncestor: BlockHeader
  ancestorHeaders: BlockHeader[]
}

/**
 * Immutable blockchain manager interface.
 * Provides a purely functional API for working with the blockchain.
 * Wraps FrozenBlockchainConfig + mutable state (heads, DB).
 */
export interface BlockchainManager {
  /** Immutable blockchain configuration */
  readonly config: FrozenBlockchainConfig

  /** Database manager for block storage */
  readonly dbManager: DBManager

  /** Raw database for consensus operations (clique, etc) */
  readonly db: DB<Uint8Array | string | number, Uint8Array | string | DBObject>

  /** Event emitter for blockchain events */
  readonly events: EventEmitter<BlockchainEvent>

  /** HardforkManager instance (convenience accessor) */
  readonly hardforkManager: HardforkManager

  /** Current consensus implementation */
  readonly consensus: Consensus | undefined

  /** Genesis block */
  readonly genesisBlock: Block

  // === Head Management ===

  /**
   * Returns the specified iterator head.
   * @param name - Optional name of the iterator head (default: 'vm')
   */
  getIteratorHead(name?: string): Promise<Block>

  /**
   * Returns the iterator head, or undefined if not set.
   */
  getIteratorHeadSafe(name?: string): Promise<Block | undefined>

  /**
   * Returns the latest header in the canonical chain.
   */
  getCanonicalHeadHeader(): Promise<BlockHeader>

  /**
   * Returns the latest full block in the canonical chain.
   */
  getCanonicalHeadBlock(): Promise<Block>

  /**
   * Set header hash of a certain tag.
   */
  setIteratorHead(tag: string, headHash: Uint8Array): Promise<void>

  // === Block Operations ===

  /**
   * Adds a block to the blockchain.
   */
  putBlock(block: Block): Promise<void>

  /**
   * Adds multiple blocks to the blockchain.
   */
  putBlocks(blocks: Block[]): Promise<void>

  /**
   * Adds a header to the blockchain.
   */
  putHeader(header: BlockHeader): Promise<void>

  /**
   * Adds multiple headers to the blockchain.
   */
  putHeaders(headers: BlockHeader[]): Promise<void>

  /**
   * Gets a block by its hash or number.
   */
  getBlock(blockId: Uint8Array | number | bigint): Promise<Block>

  /**
   * Gets multiple blocks starting from blockId.
   */
  getBlocks(
    blockId: Uint8Array | bigint | number,
    maxBlocks: number,
    skip: number,
    reverse: boolean,
  ): Promise<Block[]>

  /**
   * Gets a header by number from the canonical chain.
   */
  getCanonicalHeader(number: bigint): Promise<BlockHeader>

  /**
   * Deletes a block from the blockchain.
   */
  delBlock(blockHash: Uint8Array): Promise<void>

  /**
   * Resets the canonical chain to the specified block number.
   */
  resetCanonicalHead(canonicalHead: bigint): Promise<void>

  // === Difficulty & Validation ===

  /**
   * Gets total difficulty for a block.
   */
  getTotalDifficulty(hash: Uint8Array, number?: bigint): Promise<bigint>

  /**
   * Gets total difficulty for a header's parent.
   */
  getParentTD(header: BlockHeader): Promise<bigint>

  /**
   * Validates a block header.
   */
  validateHeader(header: BlockHeader, height?: bigint): Promise<void>

  /**
   * Validates a full block.
   */
  validateBlock(block: Block): Promise<void>

  // === Iteration ===

  /**
   * Iterates through blocks starting at the iterator head.
   */
  iterator(
    name: string,
    onBlock: OnBlock,
    maxBlocks?: number,
    releaseLockOnCallback?: boolean,
  ): Promise<number>

  /**
   * Given ordered hashes, returns those not in the blockchain.
   */
  selectNeededHashes(hashes: Uint8Array[]): Promise<Uint8Array[]>

  // === Utility ===

  /**
   * Returns a shallow copy of the blockchain.
   */
  shallowCopy(): BlockchainManager

  /**
   * Safely converts block number to hash.
   */
  safeNumberToHash(number: bigint): Promise<Uint8Array | false>

  /**
   * Check and transition hardfork by block number.
   */
  checkAndTransitionHardForkByNumber(
    number: bigint,
    timestamp?: bigint,
  ): Promise<void>

  // === Genesis ===

  /**
   * Creates a genesis block from state root.
   */
  createGenesisBlock(stateRoot: Uint8Array): Block
}

/**
 * Context passed to pure helper functions for DB operations
 */
export interface BlockchainDBContext {
  readonly dbManager: DBManager
  readonly hardforkManager: HardforkManager
}

/**
 * Context for chain operations requiring config
 */
export interface BlockchainConfigContext {
  readonly config: FrozenBlockchainConfig
  readonly dbManager: DBManager
}

/**
 * Mutable state tracked by the blockchain manager
 */
export interface BlockchainMutableState {
  heads: Record<string, Uint8Array>
  headHeaderHash: Uint8Array | undefined
  headBlockHash: Uint8Array | undefined
  deletedBlocks: Block[]
}

/**
 * Parameters for saving head operations to DB
 */
export interface SaveHeadOpsParams {
  heads: Record<string, Uint8Array>
  headHeaderHash: Uint8Array
  headBlockHash: Uint8Array
}

/**
 * Result from putting a block or header
 */
export interface PutBlockResult {
  dbOps: DBOp[]
  commonAncestor?: BlockHeader
  ancestorHeaders?: BlockHeader[]
}

// Re-export DBOp type for convenience
export type { DBOp }
