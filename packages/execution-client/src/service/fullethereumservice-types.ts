import type { AbstractLevel } from 'abstract-level'
import type { Chain } from '../blockchain/index'
import type { Config } from '../config/index'
import type { VMExecution } from '../execution/index'
import type { PeerPoolLike } from '../net/peerpool-types'
import type { ExecutionNode } from '../node/index'
import type { FullSynchronizer } from '../sync/index'
import type { TxPool } from './txpool'

/**
 * GlobalConfig interface for execution node
 * @deprecated Use ExecutionNode directly
 */
export interface IFullEthereumService {
  pool: PeerPoolLike
  chain: Chain
  execution: VMExecution
  txPool: TxPool
  synchronizer?: FullSynchronizer
}

/**
 * Type alias for execution node
 * @deprecated Use ExecutionNode directly
 */
export type FullEthereumServiceLike = ExecutionNode

/**
 * Backward compatibility alias
 * @deprecated Use ExecutionNode directly
 */
export type FullEthereumService = ExecutionNode

export interface ServiceOptions {
  /* Config (should have node property - Config now creates P2PNode automatically) */
  config: Config

  /* Blockchain (optional - will be created if not provided) */
  chain?: Chain

  /* Blockchain database */
  chainDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /* State database */
  stateDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /* Meta database (receipts, logs, indexes) */
  metaDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /* Sync retry interval in ms (default: 8000) */
  interval?: number

  /* Protocol timeout in ms (default: 6000) */
  timeout?: number
}
