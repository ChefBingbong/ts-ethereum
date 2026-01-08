import type { Block } from '@ts-ethereum/block'
import type { VM } from '@ts-ethereum/vm'
import type { Chain } from '../../../blockchain/index'
import type { Config } from '../../../config/index'
import type { VMExecution } from '../../../execution/index'
import { PendingBlock } from '../../../miner/index'
import type { ExecutionNode } from '../../../node/index'
import type { Skeleton } from '../../../service/skeleton'
import type { TxPool } from '../../../service/txpool'
import { CLConnectionManager } from './CLConnectionManager'
import type { ChainCache } from './types'

/**
 * Shared context for all engine RPC methods.
 * This replaces the instance variables from the original Engine class.
 */
export type EngineContext = {
  // Node references
  node: ExecutionNode
  chain: Chain
  config: Config
  execution: VMExecution
  skeleton: Skeleton
  txPool: TxPool
  vm: VM

  // Connection manager
  connectionManager: CLConnectionManager

  // Pending block builder
  pendingBlock: PendingBlock

  // Block caches (references to chain.blockCache)
  remoteBlocks: Map<string, Block>
  executedBlocks: Map<string, Block>
  invalidBlocks: Map<string, Error>
  chainCache: ChainCache

  // State tracking
  lastNewPayloadHF: { value: string }
  lastForkchoiceUpdatedHF: { value: string }
  lastAnnouncementTime: { value: number }
  lastAnnouncementStatus: { value: string }
}

/**
 * Creates the shared engine context from an ExecutionNode.
 * This context is passed to all engine RPC method handlers.
 */
export const createEngineContext = (node: ExecutionNode): EngineContext => {
  const chain = node.chain
  const config = chain.config
  const executionService = node.execution

  if (executionService.execution === undefined) {
    throw Error('execution required for engine module')
  }
  const execution = executionService.execution

  if (executionService.skeleton === undefined) {
    throw Error('skeleton required for engine module')
  }
  const skeleton = executionService.skeleton

  const txPool = executionService.txPool
  const vm = execution.vm

  // Create connection manager with callback for EL status logging
  const connectionManager = new CLConnectionManager({
    config,
    inActivityCb: () => logELStatus(ctx),
  })

  // Create pending block for payload building
  const pendingBlock = new PendingBlock({ config, txPool })

  // Get block caches from chain
  const remoteBlocks = chain.blockCache.remoteBlocks
  const executedBlocks = chain.blockCache.executedBlocks
  const invalidBlocks = chain.blockCache.invalidBlocks

  const chainCache: ChainCache = {
    remoteBlocks,
    executedBlocks,
    invalidBlocks,
    skeleton,
  }

  // Mutable state tracking objects (wrapped to allow mutation in handlers)
  const lastNewPayloadHF = { value: '' }
  const lastForkchoiceUpdatedHF = { value: '' }
  const lastAnnouncementTime = { value: Date.now() }
  const lastAnnouncementStatus = { value: '' }

  const ctx: EngineContext = {
    node,
    chain,
    config,
    execution,
    skeleton,
    txPool,
    vm,
    connectionManager,
    pendingBlock,
    remoteBlocks,
    executedBlocks,
    invalidBlocks,
    chainCache,
    lastNewPayloadHF,
    lastForkchoiceUpdatedHF,
    lastAnnouncementTime,
    lastAnnouncementStatus,
  }

  return ctx
}

/**
 * Log EL sync status - extracted from the original Engine class
 */
export const logELStatus = (ctx: EngineContext): void => {
  const forceShowInfo = Date.now() - ctx.lastAnnouncementTime.value > 6_000
  if (forceShowInfo) {
    ctx.lastAnnouncementTime.value = Date.now()
  }

  const beaconSync = ctx.node.execution.synchronizer
  const fetcher =
    'fetcher' in beaconSync ? (beaconSync as any).fetcher : undefined

  ctx.lastAnnouncementStatus.value = ctx.skeleton.logSyncStatus('[ EL ]', {
    forceShowInfo,
    lastStatus: ctx.lastAnnouncementStatus.value,
    vmexecution: {
      started: ctx.execution.started,
      running: ctx.execution.running,
    },
    fetching:
      fetcher !== undefined &&
      fetcher !== null &&
      fetcher.syncErrored === undefined,
    snapsync: undefined, // Snapsync not implemented in this codebase
    peers: ctx.node.peerCount(),
  })
}
