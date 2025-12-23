import type { Block } from '@ts-ethereum/block'
import type { VM } from '@ts-ethereum/vm'
import type { AbstractLevel } from 'abstract-level'
import type { Chain } from '../blockchain/chain'
import type { Config } from '../config/index'
import { Miner } from '../miner/index'
import type { NetworkCore } from '../net/core/network-core'
import { TxPool } from '../service/txpool'
import { FullSynchronizer } from '../sync/index'
import { Event } from '../types'
import { VMExecution } from './vmexecution'

export interface ExecutionServiceModules {
  config: Config
  chain: Chain
  execution: VMExecution
  txPool: TxPool
  miner: Miner
  synchronizer: FullSynchronizer
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
  public readonly synchronizer: FullSynchronizer
  public readonly config: Config

  static async init(
    options: ExecutionServiceInitOptions,
  ): Promise<ExecutionService> {
    const txPool = new TxPool({
      config: options.config,
      pool: options.networkCore,
      chain: options.chain,
      execution: options.execution,
    })

    const synchronizer = new FullSynchronizer({
      core: options.networkCore,
      txPool,
      execution: options.execution,
      interval: 1000,
    })

    const miner = new Miner({
      config: options.config,
      txPool: txPool,
      synchronizer: synchronizer,
      chain: options.chain,
      execution: options.execution,
    })

    const service = new ExecutionService({
      config: options.config,
      chain: options.chain,
      execution: options.execution,
      txPool,
      miner,
      synchronizer,
    })

    // Initialize components
    await options.execution.open()
    txPool.open()
    await synchronizer.open()
    synchronizer.opened = true

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
  }

  /**
   * Get VM instance for RPC compatibility
   */
  get vm(): VM | undefined {
    return this.execution.vm
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
      this.removeEventListeners()
    } catch {
      this.removeEventListeners()
    }
  }
}
