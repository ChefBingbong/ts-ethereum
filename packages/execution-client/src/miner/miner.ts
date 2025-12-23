import { type Block, type BlockHeader, createBlock } from '@ts-ethereum/block'
import {
  Ethash,
  type Miner as EthashMiner,
  type Solution,
} from '@ts-ethereum/consensus'
import { BIGINT_0, BIGINT_1, bytesToHex } from '@ts-ethereum/utils'
import { buildBlock, type TxReceipt } from '@ts-ethereum/vm'
import { Chain } from '../blockchain/chain'
import type { Config } from '../config/index'
import type { VMExecution } from '../execution/index'
import { IndexOperation, IndexType } from '../execution/txIndex'
import { TxPool } from '../service/txpool'
import type { FullSynchronizer } from '../sync/index'
import { Event } from '../types'

export interface MinerOptions {
  /* Config */
  config: Config

  txPool: TxPool
  chain: Chain
  execution: VMExecution
  synchronizer: FullSynchronizer
  /* Skip hardfork validation */
  skipHardForkValidation?: boolean
}

/**
 * @module miner
 */

/**
 * Implements Ethereum block creation and mining.
 * @memberof module:miner
 */
export class Miner {
  private DEFAULT_PERIOD = 10
  private _nextAssemblyTimeoutId: NodeJS.Timeout | undefined /* global NodeJS */
  private _boundChainUpdatedHandler: (() => void) | undefined
  private config: Config
  private txPool: TxPool
  private chain: Chain
  private execution: VMExecution
  private synchronizer: FullSynchronizer
  private assembling: boolean
  private period: number
  private ethash: Ethash | undefined
  private currentEthashMiner: EthashMiner | undefined
  private skipHardForkValidation?: boolean
  public running: boolean

  /**
   * Create miner
   * @param options constructor parameters
   */
  constructor(options: MinerOptions) {
    this.config = options.config
    this.txPool = options.txPool
    this.chain = options.chain
    this.execution = options.execution
    this.synchronizer = options.synchronizer
    this.running = false
    this.assembling = false
    this.skipHardForkValidation = options.skipHardForkValidation
    // PoW only - use default period
    this.period = this.DEFAULT_PERIOD * 1000 // defined in ms for setTimeout use
    this.ethash = new Ethash(this.chain.blockchain.db as any)
  }

  /**
   * Convenience alias to return the latest block in the blockchain
   */
  private latestBlockHeader(): BlockHeader {
    return this.chain.headers.latest!
  }

  /**
   * Sets the timeout for the next block assembly
   */
  private async queueNextAssembly(timeout?: number) {
    if (this._nextAssemblyTimeoutId) {
      clearTimeout(this._nextAssemblyTimeoutId)
    }
    if (!this.running) {
      return
    }

    // Frontier/Chainstart only - PoW mining
    timeout = timeout ?? this.period

    this._nextAssemblyTimeoutId = setTimeout(
      this.assembleBlock.bind(this),
      timeout,
    )
  }

  /**
   * Finds PoW solution for a specific block.
   * The solution must be computed for the actual block being mined, not the parent.
   */
  private async findSolutionForBlock(
    block: Block,
  ): Promise<Solution | undefined> {
    if (typeof this.ethash === 'undefined') {
      return undefined
    }
    this.config.options.logger?.info(
      `Miner: Finding PoW solution for block ${block.header.number} (difficulty: ${block.header.difficulty}) 🔨`,
    )
    const startTime = Date.now()
    this.currentEthashMiner = this.ethash.getMiner(block)
    const solution = await this.currentEthashMiner.iterate(-1)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    this.config.options.logger?.info(
      `Miner: Found PoW solution in ${elapsed}s 🔨`,
    )
    return solution
  }

  /**
   * Sets the next block assembly to latestBlock.timestamp + period
   */
  private async chainUpdated() {
    this.currentEthashMiner?.stop()
    const latestBlockHeader = this.latestBlockHeader()
    const target =
      Number(latestBlockHeader.timestamp) * 1000 + this.period - Date.now()
    const timeout = BIGINT_0 > target ? 0 : target
    this.config.options.logger?.debug(
      `Miner: Chain updated with block ${
        latestBlockHeader.number
      }. Queuing next block assembly in ${Math.round(timeout / 1000)}s`,
    )
    await this.queueNextAssembly(timeout)
  }

  /**
   * Pre-warm the ethash cache for the current epoch.
   * This is CPU-intensive and takes 1-2 minutes on first run.
   */
  private async warmupEthashCache() {
    if (!this.ethash) return
    const blockNumber = this.latestBlockHeader().number + BIGINT_1
    this.config.options.logger?.info(
      `Miner: Warming up ethash cache for block ${blockNumber} (this may take 1-2 minutes on first run)...`,
    )
    const startTime = Date.now()
    await this.ethash.loadEpoc(blockNumber)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    this.config.options.logger?.info(
      `Miner: Ethash cache ready (took ${elapsed}s)`,
    )
  }

  /**
   * Start miner
   */
  start(): boolean {
    if (!this.config.options.mine || this.running) {
      return false
    }
    this.running = true
    this._boundChainUpdatedHandler = this.chainUpdated.bind(this)
    this.config.events.on(Event.CHAIN_UPDATED, this._boundChainUpdatedHandler)
    this.config.options.logger?.info(
      `Miner started. Assembling next block in ${this.period / 1000}s`,
    )
    // Pre-warm the ethash cache in the background
    void this.warmupEthashCache()
    void this.queueNextAssembly()
    return true
  }

  /**
   * Assembles a block from txs in the TxPool and adds it to the chain.
   * If a new block is received while assembling it will abort.
   */
  async assembleBlock() {
    if (this.assembling) {
      return
    }
    this.assembling = true

    // Abort if a new block is received while assembling this block
    // eslint-disable-next-line prefer-const
    let _boundSetInterruptHandler: () => void
    let interrupt = false
    const setInterrupt = () => {
      interrupt = true
      this.assembling = false
      this.config.events.removeListener(
        Event.CHAIN_UPDATED,
        _boundSetInterruptHandler,
      )
    }
    _boundSetInterruptHandler = setInterrupt.bind(this)
    this.config.events.once(Event.CHAIN_UPDATED, _boundSetInterruptHandler)

    const parentBlock = this.chain.blocks.latest!

    const number = parentBlock.header.number + BIGINT_1
    const { gasLimit } = parentBlock.header

    // Use a copy of the vm to not modify the existing state.
    // The state will be updated when the newly assembled block
    // is inserted into the canonical chain.
    const vmCopy = await this.execution.vm.shallowCopy()

    // Set the state root to ensure the resulting state
    // is based on the parent block's state
    try {
      await vmCopy.stateManager.setStateRoot(parentBlock.header.stateRoot)
    } catch (error) {
      this.config.options.logger?.error(
        `Miner: Failed to set state root for block ${number}: ${error}`,
      )
      this.assembling = false
      return
    }

    // IMPORTANT: Set the hardfork for the NEW block being mined
    // This ensures miner rewards and other hardfork-dependent parameters
    // are correct (e.g., 5 ETH pre-byzantium vs 3 ETH post-byzantium)

    // PoW only - calculate difficulty from parent header
    const calcDifficultyFromHeader = parentBlock.header
    const coinbase =
      this.config.options.minerCoinbase ?? this.config.options.accounts[0][0]

    const blockBuilder = await buildBlock(vmCopy, {
      parentBlock,
      headerData: {
        number,
        gasLimit,
        coinbase,
      },
      blockOpts: {
        calcDifficultyFromHeader,
        putBlockIntoBlockchain: false,
      },
    })

    // Frontier/Chainstart - no base fee
    const txs = await this.txPool.txsByPriceAndNonce(vmCopy, {})
    this.config.options.logger?.info(
      `Miner: Assembling block from ${txs.length} eligible txs`,
    )
    let index = 0
    let blockFull = false
    const receipts: TxReceipt[] = []
    while (index < txs.length && !blockFull && !interrupt) {
      try {
        const txResult = await blockBuilder.addTransaction(txs[index], {
          skipHardForkValidation: this.skipHardForkValidation,
        })
        if (this.config.options.saveReceipts) {
          receipts.push(txResult.receipt)
        }
      } catch (error) {
        if (
          (error as Error).message ===
          'tx has a higher gas limit than the remaining gas in the block'
        ) {
          if (blockBuilder.gasUsed > gasLimit - BigInt(21000)) {
            // If block has less than 21000 gas remaining, consider it full
            blockFull = true
            this.config.options.logger?.info(
              `Miner: Assembled block full (gasLeft: ${gasLimit - blockBuilder.gasUsed})`,
            )
          }
        } else {
          // If there is an error adding a tx, it will be skipped
          const hash = bytesToHex(txs[index].hash())
          this.config.options.logger?.debug(
            `Skipping tx ${hash}, error encountered when trying to add tx:\n${error}`,
          )
        }
      }
      index++
    }
    if (interrupt) return

    // Build the block first (without PoW seal)
    const { block: unsealedBlock } = await blockBuilder.build()

    if (interrupt) return

    // Now mine the PoW for the assembled block
    // The PoW must be computed for THIS block's header, not the parent
    const solution = await this.findSolutionForBlock(unsealedBlock)
    if (!solution) {
      this.config.options.logger?.error('Miner: Failed to find PoW solution')
      this.assembling = false
      return
    }

    if (interrupt) return

    // Create the final sealed block with the PoW solution
    const sealedBlockData = unsealedBlock.toJSON()
    sealedBlockData.header!.nonce = bytesToHex(solution.nonce)
    sealedBlockData.header!.mixHash = bytesToHex(solution.mixHash)
    const block = createBlock(sealedBlockData, {
      common: unsealedBlock.common,
    })

    if (this.config.options.saveReceipts) {
      await this.execution.receiptsManager?.saveReceipts(block, receipts)
    }
    if (this.execution.txIndex) {
      void this.execution.txIndex.updateIndex(
        IndexOperation.Save,
        IndexType.TxHash,
        block,
      )
    }
    this.config.options.logger?.info(
      `Miner: Sealed block with ${block.transactions.length} txs (difficulty: ${block.header.difficulty})`,
    )
    this.assembling = false
    if (interrupt) return
    // Put block in blockchain
    await (this.synchronizer as FullSynchronizer).handleNewBlock(block)
    // Remove included txs from TxPool
    this.txPool.removeNewBlockTxs([block])

    // Clear nonce cache for affected addresses and promote queued txs
    for (const tx of block.transactions) {
      const addr = tx.getSenderAddress().toString().slice(2)
      this.txPool.clearNonceCache(addr)
    }
    // Re-evaluate pool state after block is mined
    await this.txPool.demoteUnexecutables()
    await this.txPool.promoteExecutables()

    this.config.events.removeListener(
      Event.CHAIN_UPDATED,
      _boundSetInterruptHandler,
    )
  }

  /**
   * Stop miner execution
   */
  stop(): boolean {
    if (!this.running) {
      return false
    }
    this.config.events.removeListener(
      Event.CHAIN_UPDATED,
      this._boundChainUpdatedHandler!,
    )
    if (this._nextAssemblyTimeoutId) {
      clearTimeout(this._nextAssemblyTimeoutId)
    }
    this.running = false
    this.config.options.logger?.info('Miner stopped.')
    return true
  }
}
