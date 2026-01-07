/**
 * BlockchainManager - Stateful shell wrapping pure functional helpers.
 * Follows Geth's pattern: immutable config + mutable state + pure operations.
 */

import type { Block, BlockHeader } from '@ts-ethereum/block'
import { createBlockManagerCreateEmpty, isBlock } from '@ts-ethereum/block'
import { ConsensusType } from '@ts-ethereum/chain-config'
import type { DB, DBObject } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  BIGINT_1,
  bytesToHex,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  Lock,
} from '@ts-ethereum/utils'
import { EventEmitter } from 'eventemitter3'
import { DBManager } from '../db/manager'
import {
  createDeleteCanonicalChainOps,
  createGenesisBlock,
  createRebuildCanonicalOps,
  createSaveHeadOps,
  createSetBlockOrHeaderOps,
  createSetHashToNumberOp,
  createSetTDOp,
  createUncleValidationContext,
  executeBatch,
  findCommonAncestor,
  getBlock,
  getCanonicalHeader,
  getConsensus,
  getHeaderByHash,
  getTotalDifficulty,
  hashToNumber,
  numberToHash,
  safeNumberToHash,
  validateBlock as validateBlockHelper,
  validateHeader as validateHeaderHelper,
} from './helpers'
import type {
  BlockchainEvent,
  BlockchainManager,
  BlockchainMutableState,
  Consensus,
  ConsensusDict,
  FrozenBlockchainConfig,
  OnBlock,
} from './types'

/**
 * Internal implementation class for BlockchainManager.
 * Contains all mutable state and delegates to pure helpers.
 */
class BlockchainManagerImpl implements BlockchainManager {
  readonly config: FrozenBlockchainConfig
  readonly dbManager: DBManager
  readonly events: EventEmitter<BlockchainEvent>

  private _db: DB<Uint8Array | string | number, Uint8Array | string | DBObject>
  private _consensusDict: ConsensusDict
  private _state: BlockchainMutableState
  private _lock: Lock

  constructor(
    config: FrozenBlockchainConfig,
    db: DB<Uint8Array | string | number, Uint8Array | string | DBObject>,
    consensusDict: ConsensusDict,
  ) {
    this.config = config
    this._db = db
    this.dbManager = new DBManager(db, config.hardforkManager)
    this.events = new EventEmitter<BlockchainEvent>()

    this._consensusDict = consensusDict
    this._lock = new Lock()
    this._state = {
      heads: {},
      headHeaderHash: undefined,
      headBlockHash: undefined,
      deletedBlocks: [],
    }
  }

  // ============================================================================
  // Convenience Accessors
  // ============================================================================

  get hardforkManager() {
    return this.config.hardforkManager
  }

  get db(): DB<Uint8Array | string | number, Uint8Array | string | DBObject> {
    return this._db
  }

  get consensus(): Consensus | undefined {
    return getConsensus(this._consensusDict, this.config.hardforkManager)
  }

  get genesisBlock(): Block {
    return this.config.genesisBlock
  }

  // ============================================================================
  // State Initialization
  // ============================================================================

  /**
   * Initialize mutable state from database.
   * Called during factory construction.
   */
  async initializeState(
    heads: Record<string, Uint8Array> | undefined,
    headHeaderHash: Uint8Array,
    headBlockHash: Uint8Array,
  ): Promise<void> {
    this._state.heads = heads ?? {}
    this._state.headHeaderHash = headHeaderHash
    this._state.headBlockHash = headBlockHash
  }

  // ============================================================================
  // Lock Helpers
  // ============================================================================

  private async runWithLock<T>(action: () => Promise<T>): Promise<T> {
    try {
      await this._lock.acquire()
      return await action()
    } finally {
      this._lock.release()
    }
  }

  // ============================================================================
  // Head Management
  // ============================================================================

  async getIteratorHead(name = 'vm'): Promise<Block> {
    return this.runWithLock(async () => {
      const head = await this.getHead(name, false)
      return head!
    })
  }

  async getIteratorHeadSafe(name = 'vm'): Promise<Block | undefined> {
    return this.runWithLock(async () => {
      return this.getHead(name, true)
    })
  }

  private async getHead(
    name: string,
    returnUndefinedIfNotSet = false,
  ): Promise<Block | undefined> {
    const headHash = this._state.heads[name]
    if (headHash === undefined && returnUndefinedIfNotSet) {
      return undefined
    }
    const hash = this._state.heads[name] ?? this.genesisBlock.hash()
    return this.getBlock(hash)
  }

  async getCanonicalHeadHeader(): Promise<BlockHeader> {
    return this.runWithLock(async () => {
      if (!this._state.headHeaderHash) {
        throw EthereumJSErrorWithoutCode('No head header set')
      }
      return getHeaderByHash(this.dbManager, this._state.headHeaderHash)
    })
  }

  async getCanonicalHeadBlock(): Promise<Block> {
    return this.runWithLock(async () => {
      if (!this._state.headBlockHash) {
        throw EthereumJSErrorWithoutCode('No head block set')
      }
      const block = await getBlock(this.dbManager, this._state.headBlockHash)
      if (!block) {
        throw EthereumJSErrorWithoutCode('Head block not found in DB')
      }
      return block
    })
  }

  async setIteratorHead(tag: string, headHash: Uint8Array): Promise<void> {
    await this.runWithLock(async () => {
      this._state.heads[tag] = headHash
      await this.saveHeads()
    })
  }

  private async saveHeads(): Promise<void> {
    const ops = createSaveHeadOps({
      heads: this._state.heads,
      headHeaderHash: this._state.headHeaderHash!,
      headBlockHash: this._state.headBlockHash!,
    })
    await executeBatch(this.dbManager, ops)
  }

  // ============================================================================
  // Block Operations
  // ============================================================================

  async putBlock(block: Block): Promise<void> {
    await this.putBlockOrHeader(block)
  }

  async putBlocks(blocks: Block[]): Promise<void> {
    for (const block of blocks) {
      await this.putBlock(block)
    }
  }

  async putHeader(header: BlockHeader): Promise<void> {
    await this.putBlockOrHeader(header)
  }

  async putHeaders(headers: BlockHeader[]): Promise<void> {
    for (const header of headers) {
      await this.putHeader(header)
    }
  }

  private async putBlockOrHeader(item: Block | BlockHeader): Promise<void> {
    await this.runWithLock(async () => {
      // Save current state for rollback on error
      const oldHeads = { ...this._state.heads }
      const oldHeadHeaderHash = this._state.headHeaderHash
      const oldHeadBlockHash = this._state.headBlockHash

      try {
        let blockToProcess: Block
        let itemToStore: Block | BlockHeader = item

        if (isBlock(item)) {
          blockToProcess = item
        } else {
          // Handle header-only insertion
          const header = item as BlockHeader
          const hasTransactions = !equalsBytes(
            header.transactionsTrie,
            KECCAK256_RLP,
          )
          const hasUncles = !equalsBytes(header.uncleHash, KECCAK256_RLP_ARRAY)

          if (hasTransactions || hasUncles) {
            itemToStore = header
            blockToProcess = createBlockManagerCreateEmpty(header, {
              hardforkManager: header.hardforkManager,
            })
          } else {
            blockToProcess = createBlockManagerCreateEmpty(header, {
              hardforkManager: header.hardforkManager,
            })
            itemToStore = blockToProcess
          }
        }

        const isGenesis = blockToProcess.isGenesis()

        // Cannot overwrite genesis after initialization
        if (isGenesis) {
          if (equalsBytes(this.genesisBlock.hash(), blockToProcess.hash())) {
            return
          }
          throw EthereumJSErrorWithoutCode(
            'Cannot put a different genesis block than current blockchain genesis',
          )
        }

        const { header } = blockToProcess
        const blockHash = header.hash()
        const blockNumber = header.number
        let td = header.difficulty
        const currentTd = { header: BIGINT_0, block: BIGINT_0 }
        const dbOps = []

        // Validate chain ID
        if (
          blockToProcess.hardforkManager.chainId() !==
          this.hardforkManager.chainId()
        ) {
          throw EthereumJSErrorWithoutCode(
            `Chain mismatch: block chain ID ${blockToProcess.hardforkManager.chainId()}, blockchain chain ID ${this.hardforkManager.chainId()}`,
          )
        }

        // Validate block if configured
        if (this.config.validateBlocks && !isGenesis && isBlock(item)) {
          await this.validateBlock(blockToProcess)
        }

        // Validate consensus if configured
        if (this.config.validateConsensus && this.consensus) {
          await this.consensus.validateConsensus(blockToProcess)
        }

        // Get current total difficulties
        if (this._state.headHeaderHash) {
          currentTd.header = await this.getTotalDifficulty(
            this._state.headHeaderHash,
          )
        }
        if (this._state.headBlockHash) {
          currentTd.block = await this.getTotalDifficulty(
            this._state.headBlockHash,
          )
        }

        // Calculate new block's total difficulty
        const parentTd = await this.getParentTD(header)
        if (!blockToProcess.isGenesis()) {
          td += parentTd
        }

        // Create DB operations for TD and block/header storage
        dbOps.push(createSetTDOp(td, blockNumber, blockHash))
        dbOps.push(...createSetBlockOrHeaderOps(itemToStore))

        let commonAncestor: BlockHeader | undefined
        let ancestorHeaders: BlockHeader[] | undefined

        // Determine if this block becomes canonical
        const shouldBecomeCanonical =
          blockToProcess.isGenesis() ||
          td > currentTd.header ||
          blockToProcess.hardforkManager.config.spec.chain.consensus.type ===
            ConsensusType.ProofOfStake

        if (shouldBecomeCanonical) {
          // Find common ancestor for reorg
          if (this._state.headHeaderHash) {
            const result = await findCommonAncestor(
              header,
              this._state.headHeaderHash,
              this.dbManager,
            )
            commonAncestor = result.commonAncestor
            ancestorHeaders = result.ancestorHeaders
          }

          // Update head pointers
          this._state.headHeaderHash = blockHash
          if (isBlock(item)) {
            this._state.headBlockHash = blockHash
          }

          if (this.config.hardforkByHeadBlockNumber) {
            await this.checkAndTransitionHardForkByNumber(
              blockNumber,
              header.timestamp,
            )
          }

          // Delete stale canonical references
          const trackDeleted =
            this.events.listenerCount('deletedCanonicalBlocks') > 0
          const deleteResult = await createDeleteCanonicalChainOps(
            blockNumber + BIGINT_1,
            blockHash,
            this._state,
            this.dbManager,
            trackDeleted,
          )
          dbOps.push(...deleteResult.ops)
          this._state.deletedBlocks = deleteResult.deletedBlocks
          this._state.heads = deleteResult.updatedHeads
          this._state.headHeaderHash = deleteResult.updatedHeadHeaderHash
          this._state.headBlockHash = deleteResult.updatedHeadBlockHash

          // Rebuild canonical chain references
          const rebuildResult = await createRebuildCanonicalOps(
            header,
            this._state,
            this.dbManager,
          )
          dbOps.push(...rebuildResult.ops)
          this._state.heads = rebuildResult.updatedHeads
          this._state.headBlockHash = rebuildResult.updatedHeadBlockHash
        } else {
          // Non-canonical block - just update headBlockHash if higher TD
          if (td > currentTd.block && isBlock(item)) {
            this._state.headBlockHash = blockHash
          }
          dbOps.push(createSetHashToNumberOp(blockHash, blockNumber))
        }

        // Add head save operations and execute batch
        dbOps.push(
          ...createSaveHeadOps({
            heads: this._state.heads,
            headHeaderHash: this._state.headHeaderHash!,
            headBlockHash: this._state.headBlockHash!,
          }),
        )
        await executeBatch(this.dbManager, dbOps)

        // Notify consensus of new block
        await this.consensus?.newBlock(
          blockToProcess,
          commonAncestor,
          ancestorHeaders,
        )
      } catch (e) {
        // Rollback state on error
        this._state.heads = oldHeads
        this._state.headHeaderHash = oldHeadHeaderHash
        this._state.headBlockHash = oldHeadBlockHash
        throw e
      }
    })

    // Emit events for deleted blocks
    if (this._state.deletedBlocks.length > 0) {
      this.events.emit('deletedCanonicalBlocks', this._state.deletedBlocks)
      this._state.deletedBlocks = []
    }
  }

  async getBlock(blockId: Uint8Array | number | bigint): Promise<Block> {
    const block = await getBlock(this.dbManager, blockId)
    if (block === undefined) {
      if (blockId instanceof Uint8Array) {
        throw EthereumJSErrorWithoutCode(
          `Block with hash ${bytesToHex(blockId)} not found in DB`,
        )
      }
      throw EthereumJSErrorWithoutCode(
        `Block number ${blockId} not found in DB`,
      )
    }
    return block
  }

  async getBlocks(
    blockId: Uint8Array | bigint | number,
    maxBlocks: number,
    skip: number,
    reverse: boolean,
  ): Promise<Block[]> {
    return this.runWithLock(async () => {
      const blocks: Block[] = []
      let i = -1

      const nextBlock = async (
        id: Uint8Array | bigint | number,
      ): Promise<void> => {
        let block: Block | undefined
        try {
          block = await this.getBlock(id)
        } catch {
          return
        }

        i++
        const nextBlockNumber = block.header.number + BigInt(reverse ? -1 : 1)
        if (i !== 0 && skip && i % (skip + 1) !== 0) {
          return nextBlock(nextBlockNumber)
        }
        blocks.push(block)
        if (blocks.length < maxBlocks) {
          await nextBlock(nextBlockNumber)
        }
      }

      await nextBlock(blockId)
      return blocks
    })
  }

  async getCanonicalHeader(number: bigint): Promise<BlockHeader> {
    return getCanonicalHeader(this.dbManager, number)
  }

  async delBlock(blockHash: Uint8Array): Promise<void> {
    // TODO: Implement block deletion using pure helpers
    throw new Error('delBlock not yet implemented')
  }

  async resetCanonicalHead(canonicalHead: bigint): Promise<void> {
    await this.runWithLock(async () => {
      const hash = await numberToHash(this.dbManager, canonicalHead)
      if (hash === undefined) {
        throw EthereumJSErrorWithoutCode(
          `no block for ${canonicalHead} found in DB`,
        )
      }
      const header = await getHeaderByHash(this.dbManager, hash, canonicalHead)

      const trackDeleted =
        this.events.listenerCount('deletedCanonicalBlocks') > 0
      const deleteResult = await createDeleteCanonicalChainOps(
        canonicalHead + BIGINT_1,
        hash,
        this._state,
        this.dbManager,
        trackDeleted,
      )

      this._state.heads = deleteResult.updatedHeads
      this._state.headHeaderHash = deleteResult.updatedHeadHeaderHash
      this._state.headBlockHash = deleteResult.updatedHeadBlockHash
      this._state.deletedBlocks = deleteResult.deletedBlocks

      const ops = [
        ...deleteResult.ops,
        ...createSaveHeadOps({
          heads: this._state.heads,
          headHeaderHash: this._state.headHeaderHash!,
          headBlockHash: this._state.headBlockHash!,
        }),
      ]

      await executeBatch(this.dbManager, ops)
      await this.checkAndTransitionHardForkByNumber(
        canonicalHead,
        header.timestamp,
      )
    })

    if (this._state.deletedBlocks.length > 0) {
      this.events.emit('deletedCanonicalBlocks', this._state.deletedBlocks)
      this._state.deletedBlocks = []
    }
  }

  // ============================================================================
  // Difficulty & Validation
  // ============================================================================

  async getTotalDifficulty(hash: Uint8Array, number?: bigint): Promise<bigint> {
    if (number === undefined) {
      number = await hashToNumber(this.dbManager, hash)
      if (number === undefined) {
        throw EthereumJSErrorWithoutCode(
          `Block with hash ${bytesToHex(hash)} not found in DB`,
        )
      }
    }
    return getTotalDifficulty(this.dbManager, hash, number)
  }

  async getParentTD(header: BlockHeader): Promise<bigint> {
    return header.number === BIGINT_0
      ? header.difficulty
      : this.getTotalDifficulty(header.parentHash, header.number - BIGINT_1)
  }

  async validateHeader(header: BlockHeader, height?: bigint): Promise<void> {
    const ctx = createUncleValidationContext(
      this.config,
      this.dbManager,
      this.consensus,
    )
    await validateHeaderHelper(header, ctx, height)
  }

  async validateBlock(block: Block): Promise<void> {
    const ctx = createUncleValidationContext(
      this.config,
      this.dbManager,
      this.consensus,
    )
    await validateBlockHelper(block, ctx)
  }

  // ============================================================================
  // Iteration
  // ============================================================================

  async iterator(
    name: string,
    onBlock: OnBlock,
    maxBlocks?: number,
    releaseLockOnCallback?: boolean,
  ): Promise<number> {
    return this.runWithLock(async () => {
      let headHash = this._state.heads[name] ?? this.genesisBlock.hash()

      if (typeof maxBlocks === 'number' && maxBlocks < 0) {
        throw new Error(
          'If maxBlocks is provided, it has to be a non-negative number',
        )
      }

      let headBlockNumber = await hashToNumber(this.dbManager, headHash)
      let nextBlockNumber = headBlockNumber! + BIGINT_1
      let blocksRanCounter = 0
      let lastBlock: Block | undefined

      try {
        while (maxBlocks !== blocksRanCounter) {
          try {
            let nextBlock = await this.getBlock(nextBlockNumber)
            const reorg = lastBlock
              ? !equalsBytes(lastBlock.hash(), nextBlock.header.parentHash)
              : false

            if (reorg) {
              headHash = this._state.heads[name] ?? this.genesisBlock.hash()
              headBlockNumber = await hashToNumber(this.dbManager, headHash)
              nextBlockNumber = headBlockNumber! + BIGINT_1
              nextBlock = await this.getBlock(nextBlockNumber)
            }

            let reorgWhileOnBlock = false
            if (releaseLockOnCallback === true) {
              this._lock.release()
            }
            try {
              await onBlock(nextBlock, reorg)
            } finally {
              if (releaseLockOnCallback === true) {
                await this._lock.acquire()
                const nextBlockMayBeReorged = await getBlock(
                  this.dbManager,
                  nextBlockNumber,
                ).catch(() => null)
                reorgWhileOnBlock = nextBlockMayBeReorged
                  ? !equalsBytes(nextBlockMayBeReorged.hash(), nextBlock.hash())
                  : true
              }
            }

            if (!reorgWhileOnBlock) {
              this._state.heads[name] = nextBlock.hash()
              lastBlock = nextBlock
              nextBlockNumber++
            }
            blocksRanCounter++
          } catch (error: any) {
            if (error.message?.includes('not found in DB')) {
              break
            }
            throw error
          }
        }
        return blocksRanCounter
      } finally {
        await this.saveHeads()
      }
    })
  }

  async selectNeededHashes(hashes: Uint8Array[]): Promise<Uint8Array[]> {
    return this.runWithLock(async () => {
      let max = hashes.length - 1
      let min = 0
      let mid = 0

      while (max >= min) {
        let number: bigint | undefined
        try {
          number = await hashToNumber(this.dbManager, hashes[mid])
        } catch {
          number = undefined
        }

        if (number !== undefined) {
          min = mid + 1
        } else {
          max = mid - 1
        }
        mid = Math.floor((min + max) / 2)
      }
      return hashes.slice(min)
    })
  }

  // ============================================================================
  // Utility
  // ============================================================================

  shallowCopy(): BlockchainManager {
    const copy = Object.create(
      Object.getPrototypeOf(this),
      Object.getOwnPropertyDescriptors(this),
    )
    return copy
  }

  async safeNumberToHash(number: bigint): Promise<Uint8Array | false> {
    return safeNumberToHash(this.dbManager, number)
  }

  async checkAndTransitionHardForkByNumber(
    number: bigint,
    timestamp?: bigint,
  ): Promise<void> {
    // HardforkManager is stateless, so this is mostly for consensus setup
    await this.consensus?.setup({ blockchain: this })
    await this.consensus?.genesisInit(this.genesisBlock)
  }

  createGenesisBlock(stateRoot: Uint8Array): Block {
    return createGenesisBlock(stateRoot, this.hardforkManager)
  }
}

/**
 * Creates a BlockchainManager implementation.
 * This is the internal factory used by the public creator functions.
 */
export function createBlockchainManagerImpl(
  config: FrozenBlockchainConfig,
  db: DB<Uint8Array | string | number, Uint8Array | string | DBObject>,
  consensusDict: ConsensusDict,
): BlockchainManagerImpl {
  return new BlockchainManagerImpl(config, db, consensusDict)
}

export { BlockchainManagerImpl }
