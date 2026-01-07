import type { Multiaddr } from '@multiformats/multiaddr'
import type { Block, BlockHeader } from '@ts-ethereum/block'
import type { BlockchainManager } from '@ts-ethereum/blockchain'
import type { GenesisState } from '@ts-ethereum/chain-config'
import type { Address } from '@ts-ethereum/utils'
import type { AbstractLevel } from 'abstract-level'
import type * as promClient from 'prom-client'
import type { Config, SyncMode } from '.'
import type { Peer } from './net/peer'

export type Event = (typeof Event)[keyof typeof Event]
/**
 * Types for the central event bus, emitted
 * by different components of the client.
 */
export const Event = {
  CHAIN_UPDATED: 'blockchain:chain:updated',
  CLIENT_SHUTDOWN: 'client:shutdown',
  SYNC_EXECUTION_VM_ERROR: 'sync:execution:vm:error',
  SYNC_FETCHED_BLOCKS: 'sync:fetcher:fetched_blocks',
  SYNC_FETCHED_HEADERS: 'sync:fetcher:fetched_headers',
  SYNC_SYNCHRONIZED: 'sync:synchronized',
  SYNC_ERROR: 'sync:error',
  SYNC_FETCHER_ERROR: 'sync:fetcher:error',
  PEER_CONNECTED: 'peer:connected',
  PEER_DISCONNECTED: 'peer:disconnected',
  PEER_ERROR: 'peer:error',
  SERVER_LISTENING: 'server:listening',
  SERVER_ERROR: 'server:error',
  POOL_PEER_ADDED: 'pool:peer:added',
  POOL_PEER_REMOVED: 'pool:peer:removed',
  POOL_PEER_BANNED: 'pool:peer:banned',
  PROTOCOL_ERROR: 'protocol:error',
  PROTOCOL_MESSAGE: 'protocol:message',
  CHAIN_REORG: 'blockchain:chain:reorg',
  RPC_READY: 'rpc:ready',
} as const

export interface EventParams {
  [Event.CHAIN_UPDATED]: []
  [Event.CLIENT_SHUTDOWN]: []
  [Event.SYNC_EXECUTION_VM_ERROR]: [vmError: Error]
  [Event.SYNC_FETCHED_BLOCKS]: [blocks: Block[]]
  [Event.SYNC_FETCHED_HEADERS]: [headers: BlockHeader[]]
  [Event.SYNC_SYNCHRONIZED]: [chainHeight: bigint]
  [Event.SYNC_ERROR]: [syncError: Error]
  [Event.SYNC_FETCHER_ERROR]: [
    fetchError: Error,
    task: unknown,
    peer: Peer | null | undefined,
  ]
  [Event.CHAIN_REORG]: [oldBlocks: Block[], newBlocks: Block[]]
  [Event.PEER_CONNECTED]: [connectedPeer: Peer]
  [Event.PEER_DISCONNECTED]: [disconnectedPeer: Peer]
  [Event.PEER_ERROR]: [error: Error, peerCausingError: Peer]
  [Event.SERVER_LISTENING]: [{ transport: string; url: string }]
  [Event.SERVER_ERROR]: [serverError: Error, serverCausingError: any]
  [Event.POOL_PEER_ADDED]: [addedPeer: Peer]
  [Event.POOL_PEER_REMOVED]: [removedPeer: Peer]
  [Event.POOL_PEER_BANNED]: [bannedPeer: Peer]
  [Event.PROTOCOL_ERROR]: [boundProtocolError: Error, peerCausingError: Peer]
  [Event.PROTOCOL_MESSAGE]: [
    {
      message: { name: string; data: unknown }
      protocol: string
      peer: Peer
    },
  ]
  [Event.RPC_READY]: [{ address: string; port: number }]
}

/**
 * Like types
 */
export type Key = Uint8Array
export type KeyLike = string | Key

export type MultiaddrLike = string | string[] | Multiaddr | Multiaddr[]

export interface ClientOpts {
  network?: string
  chainId?: number
  // Deprecated, use chainId instead
  networkId?: number
  sync?: SyncMode
  dataDir?: string
  customChain?: string
  customGenesisState?: string
  gethGenesis?: string
  trustedSetup?: string
  bootnodes?: string | string[]
  port?: number
  extIP?: string
  multiaddrs?: string | string[]
  rpc?: boolean
  rpcPort?: number
  rpcAddr?: string
  ws?: boolean
  wsPort?: number
  wsAddr?: string
  helpRPC?: boolean
  logLevel?: string
  logFile?: boolean | string
  logLevelFile?: string
  logRotate?: boolean
  logMaxFiles?: number
  prometheus?: boolean
  prometheusPort?: number
  rpcDebug?: string
  rpcDebugVerbose?: string
  rpcCors?: string
  maxPerRequest?: number
  maxFetcherJobs?: number
  minPeers?: number
  maxPeers?: number
  execution?: boolean
  numBlocksPerIteration?: number
  accountCache?: number
  storageCache?: number
  codeCache?: number
  trieCache?: number
  executeBlocks?: string
  debugCode?: boolean
  discV4?: boolean
  mine?: boolean
  unlock?: string
  dev?: boolean | string
  minerCoinbase?: Address
  saveReceipts?: boolean
  prefixStorageTrieKeys?: boolean
  useStringValueTrieDB?: boolean
  txLookupLimit?: number
  startBlock?: number
  isSingleNode?: boolean
  vmProfileBlocks?: boolean
  vmProfileTxs?: boolean
  loadBlocksFromRlp?: string[]
  pruneEngineCache?: boolean
  savePreimages?: boolean
  useJsCrypto?: boolean
}

/**
 * Prometheus metrics for transaction tracking.
 * Only legacy transactions are supported in this value-transfer-only blockchain.
 */
export type PrometheusMetrics = {
  legacyTxGauge: promClient.Gauge<string>
}

export interface P2PEthereumClientOptions {
  /** Client configuration */
  config: Config

  /** Custom blockchain (optional) */
  blockchain?: BlockchainManager

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
}
