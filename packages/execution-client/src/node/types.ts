import type { Blockchain } from '@ts-ethereum/blockchain'
import type { GenesisState } from '@ts-ethereum/chain-config'
import { P2PNode } from '@ts-ethereum/p2p'
import type { AbstractLevel } from 'abstract-level'
import type { Chain } from '../blockchain/index'
import type { Config } from '../config/index'
import type { ExecutionService } from '../execution/execution-service'
import type { NetworkService } from '../net/network-service'
import type { TxFetcher } from '../sync/fetcher/txFetcher'
import type { MultiaddrLike } from '../types'

/**
 * Options for initializing an ExecutionNode
 */
export interface ExecutionNodeInitOptions {
  /** Client configuration */
  config: Config

  /** Custom blockchain (optional) */
  blockchain?: Blockchain

  /**
   * Database to store blocks and metadata.
   * Should be an abstract-leveldown compliant store.
   *
   * Default: Database created by the Blockchain class
   */
  chainDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /**
   * Database to store the state.
   * Should be an abstract-leveldown compliant store.
   *
   * Default: Database created by the MerklePatriciaTrie class
   */
  stateDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /**
   * Database to store tx receipts, logs, and indexes.
   * Should be an abstract-leveldown compliant store.
   *
   * Default: Database created in datadir folder
   */
  metaDB?: AbstractLevel<
    string | Uint8Array,
    string | Uint8Array,
    string | Uint8Array
  >

  /* List of bootnodes to use for discovery */
  bootnodes?: MultiaddrLike[]

  /* List of supported clients */
  clientFilter?: string[]

  /* How often to discover new peers */
  refreshInterval?: number

  /* custom genesisState if any for the chain */
  genesisState?: GenesisState

  /* Sync retry interval in ms (default: 200) */
  interval?: number

  /* Protocol timeout in ms (default: 6000) */
  timeout?: number
}

/**
 * Modules that make up an ExecutionNode (for constructor, following lodestar pattern)
 */
export type ExecutionNodeModules = {
  config: Config
  chain: Chain
  network: NetworkService
  execution: ExecutionService
  txFetcher: TxFetcher
  p2pNode: P2PNode
}
