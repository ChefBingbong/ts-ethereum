import type { Block } from '@ts-ethereum/block'
import type { VM } from '@ts-ethereum/vm'
import type { AbstractLevel } from 'abstract-level'
import type { Chain } from '../blockchain/chain'
import type { Config } from '../config/index'
import { SyncMode } from '../config/types'
import { Miner } from '../miner/index'
import type { NetworkCore } from '../net/core/network-core'
import { Skeleton } from '../service/skeleton'
import { TxPool } from '../service/txpool'
import {
  BeaconSynchronizer,
  FullSynchronizer,
  SnapSynchronizer,
} from '../sync/index'
import { Event } from '../types'
import type { VMExecution } from './vmexecution'

export interface ExecutionServiceModules {
  config: Config
  chain: Chain
  execution: VMExecution
  txPool: TxPool
  miner: Miner
  synchronizer: FullSynchronizer | BeaconSynchronizer
  skeleton?: Skeleton
  snapsync?: SnapSynchronizer
}

export interface ExecutionServiceInitOptions {
  config: Config
  chain: Chain
  execution: VMExecution
  networkCore: NetworkCore
  stateDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >
  metaDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >
}

/**
 * ExecutionService handles chain state management, transaction processing, mining, and block execution.
 * Owns Chain, Execution, TxPool, Miner, and Synchronizer.
 * Receives NetworkCore via dependency injection for broadcasting and fetching.
 */
export class ExecutionService {
  public readonly chain: Chain
  public readonly execution: VMExecution
  public readonly txPool: TxPool
  public readonly miner: Miner
  public synchronizer: FullSynchronizer | BeaconSynchronizer
  public readonly config: Config
  public skeleton?: Skeleton
  public snapsync?: SnapSynchronizer

  /**
   * Check if we should use beacon sync mode
   */
  private static shouldUseBeaconSync(config: Config, chain: Chain): boolean {
    // Explicit config override
    if (config.options.syncmode === SyncMode.Beacon) {
      return true
    }
    if (config.options.syncmode === SyncMode.Full) {
      return false
    }

    // Auto-detect: check if we're post-merge (Paris hardfork or later)
    const currentHeight = chain.blocks.height
    const hardfork = config.hardforkManager.getHardforkByBlock(currentHeight)

    // Paris hardfork names that indicate post-merge
    const postMergeHardforks = [
      'paris',
      'merge',
      'shanghai',
      'cancun',
      'prague',
      'osaka',
    ]

    return postMergeHardforks.includes(hardfork.toLowerCase())
  }

  static async init(
    options: ExecutionServiceInitOptions,
  ): Promise<ExecutionService> {
    const txPool = new TxPool({
      config: options.config,
      pool: options.networkCore,
      chain: options.chain,
      execution: options.execution,
    })

    // Create skeleton if metaDB is provided
    let skeleton: Skeleton | undefined
    if (options.metaDB !== undefined) {
      skeleton = new Skeleton({
        config: options.config,
        chain: options.chain,
        metaDB: options.metaDB,
      })
    }

    // Determine sync mode
    const useBeaconSync = this.shouldUseBeaconSync(
      options.config,
      options.chain,
    )

    let synchronizer: FullSynchronizer | BeaconSynchronizer

    if (useBeaconSync && skeleton !== undefined) {
      options.config.options.logger?.info(
        'Using BeaconSynchronizer (post-merge mode)',
      )
      synchronizer = new BeaconSynchronizer({
        core: options.networkCore,
        skeleton,
        execution: options.execution,
        interval: 1000,
      })
    } else {
      if (useBeaconSync && skeleton === undefined) {
        options.config.options.logger?.warn(
          'BeaconSync requested but metaDB not provided, falling back to FullSynchronizer',
        )
      }
      options.config.options.logger?.info('Using FullSynchronizer')
      synchronizer = new FullSynchronizer({
        core: options.networkCore,
        txPool,
        execution: options.execution,
        interval: 1000,
      })
    }

    const miner = new Miner({
      config: options.config,
      txPool: txPool,
      synchronizer: synchronizer as FullSynchronizer,
      chain: options.chain,
      execution: options.execution,
    })

    // Create SnapSynchronizer if enabled
    let snapsync: SnapSynchronizer | undefined
    if (options.config.options.enableSnapSync && skeleton !== undefined) {
      options.config.options.logger?.info(
        'Creating SnapSynchronizer for fast state sync',
      )
      snapsync = new SnapSynchronizer({
        core: options.networkCore,
        skeleton,
        execution: options.execution,
      })
    }

    const service = new ExecutionService({
      config: options.config,
      chain: options.chain,
      execution: options.execution,
      txPool,
      miner,
      synchronizer,
      skeleton,
      snapsync,
    })

    // Initialize components
    await options.execution.open()
    txPool.open()

    // Open skeleton before synchronizer if using beacon sync
    if (skeleton !== undefined) {
      await skeleton.open()
    }

    await synchronizer.open()
    synchronizer.opened = true

    // Open snap synchronizer if enabled
    if (snapsync !== undefined) {
      await snapsync.open()
    }

    service.setupEventListeners()

    return service
  }

  constructor(modules: ExecutionServiceModules) {
    this.config = modules.config
    this.chain = modules.chain
    this.execution = modules.execution
    this.txPool = modules.txPool
    this.miner = modules.miner
    this.synchronizer = modules.synchronizer
    this.skeleton = modules.skeleton
    this.snapsync = modules.snapsync
  }

  /**
   * Get VM instance for RPC compatibility
   */
  get vm(): VM | undefined {
    return this.execution.vm
  }

  /**
   * Public accessor for BeaconSynchronizer. Returns undefined if unavailable.
   */
  get beaconSync(): BeaconSynchronizer | undefined {
    if (this.synchronizer instanceof BeaconSynchronizer) {
      return this.synchronizer
    }
    return undefined
  }

  /**
   * Switch to beacon sync mode dynamically.
   * Stops current synchronizer and creates a new BeaconSynchronizer.
   */
  async switchToBeaconSync(): Promise<boolean> {
    if (this.synchronizer instanceof BeaconSynchronizer) {
      this.config.options.logger?.debug('Already using BeaconSynchronizer')
      return true
    }

    if (this.skeleton === undefined) {
      this.config.options.logger?.error(
        'Cannot switch to beacon sync: skeleton not initialized (metaDB required)',
      )
      return false
    }

    // Stop current synchronizer
    if (this.synchronizer instanceof FullSynchronizer) {
      await this.synchronizer.stop()
      await this.synchronizer.close()
      this.miner?.stop()
      this.config.superMsg('Transitioning to beacon sync')
    }

    // Create new beacon synchronizer
    this.synchronizer = new BeaconSynchronizer({
      core: this.synchronizer['pool'] as NetworkCore,
      skeleton: this.skeleton,
      execution: this.execution,
      interval: 1000,
    })

    await this.synchronizer.open()
    this.synchronizer.opened = true

    return true
  }

  private setupEventListeners(): void {
    this.config.events.on(Event.POOL_PEER_ADDED, this.onPoolPeerAdded)
    this.config.events.on(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks)
    this.config.events.on(Event.CHAIN_REORG, this.onChainReorg)
  }

  private removeEventListeners(): void {
    this.config.events.off(Event.POOL_PEER_ADDED, this.onPoolPeerAdded)
    this.config.events.off(Event.SYNC_FETCHED_BLOCKS, this.onSyncNewBlocks)
    this.config.events.off(Event.CHAIN_REORG, this.onChainReorg)
  }

  private onPoolPeerAdded = (peer: import('../net/peer/peer').Peer): void => {
    if (!this.txPool) return

    const txs: [number[], number[], Uint8Array[]] = [[], [], []]
    for (const [_addr, txObjs] of this.txPool.pending) {
      for (const txObj of txObjs) {
        const rawTx = txObj.tx
        txs[0].push(rawTx.type)
        txs[1].push(rawTx.serialize().byteLength)
        txs[2].push(new Uint8Array(Buffer.from(txObj.hash, 'hex')))
      }
    }
    for (const [_addr, txObjs] of this.txPool.queued) {
      for (const txObj of txObjs) {
        const rawTx = txObj.tx
        txs[0].push(rawTx.type)
        txs[1].push(rawTx.serialize().byteLength)
        txs[2].push(new Uint8Array(Buffer.from(txObj.hash, 'hex')))
      }
    }
    if (txs[0].length > 0) this.txPool.sendNewTxHashes(txs, [peer])
  }

  private onSyncNewBlocks = async (blocks: Block[]): Promise<void> => {
    if (!this.txPool) return

    this.txPool.removeNewBlockTxs(blocks)

    for (const block of blocks) {
      for (const tx of block.transactions) {
        this.txPool.clearNonceCache(tx.getSenderAddress().toString().slice(2))
      }
    }
    try {
      await Promise.all([
        this.txPool.demoteUnexecutables(),
        this.txPool.promoteExecutables(),
      ])
    } catch {
      // Error handling
    }
  }

  private onChainReorg = async (
    oldBlocks: Block[],
    newBlocks: Block[],
  ): Promise<void> => {
    if (!this.txPool) return

    try {
      await this.txPool.handleReorg(oldBlocks, newBlocks)
    } catch {
      // Error handling
    }
  }

  async stop(): Promise<boolean> {
    try {
      this.txPool.stop()
      this.miner?.stop()
      await this.synchronizer?.stop()
      await this.skeleton?.close()
      await this.execution.stop()
      this.removeEventListeners()
      return true
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    try {
      this.txPool.close()
      await this.synchronizer?.close()
      await this.skeleton?.close()
      this.removeEventListeners()
    } catch {
      this.removeEventListeners()
    }
  }
}
