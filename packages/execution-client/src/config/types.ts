import type { Common } from '@ts-ethereum/chain-config'
import type { MetricsOptions } from '@ts-ethereum/metrics'
import type { P2PNode } from '@ts-ethereum/p2p'
import type { Address } from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { Logger } from '../logging'
import type { PeerInfo as DPTPeerInfo } from '../net/dpt-1/index'
import type { PrometheusMetrics } from '../types'

export type DataDirectory = (typeof DataDirectory)[keyof typeof DataDirectory]

export const DataDirectory = {
  Chain: 'chain',
  State: 'state',
  Meta: 'meta',
} as const

export type SyncMode = (typeof SyncMode)[keyof typeof SyncMode]

export const SyncMode = {
  Full: 'full',
  None: 'none',
} as const

export interface ConfigOptions {
  /**
   * Specify the chain by providing a {@link Common} instance,
   * the common instance will not be modified by client
   */
  common: Common

  /**
   * Synchronization mode ('full', 'none')
   *
   * Default: 'full'
   */
  syncmode?: SyncMode

  /**
   * A temporary option to offer backward compatibility with already-synced databases that are
   * using non-prefixed keys for storage tries
   *
   * Default: true
   */
  prefixStorageTrieKeys?: boolean

  /**
   * A temporary option to offer backward compatibility with already-synced databases that stores
   * trie items as `string`, instead of the more performant `Uint8Array`
   */
  useStringValueTrieDB?: boolean

  /**
   * Provide a custom VM instance to process blocks
   *
   * Default: VM instance created by client
   */
  vm?: VM

  /**
   * Root data directory for the blockchain
   */
  datadir?: string

  /**
   * Private key for the client.
   * Use return value of {@link Config.getClientKey}.
   * If left blank, a random key will be generated and used.
   */
  key?: Uint8Array

  /**
   * Network bootnodes
   * (e.g. abc@18.138.108.67 or /ip4/127.0.0.1/tcp/50505/p2p/QmABC)
   */
  bootnodes?: DPTPeerInfo[]

  /**
   * RLPx listening port
   *
   * Default: `30303`
   */
  port?: number

  /**
   * RLPx external IP (bind/listen address)
   */
  extIP?: string

  /**
   * IP address to advertise to peers (for Docker/NAT scenarios)
   * If not set, defaults to extIP
   */
  announceIP?: string

  /**
   * Transport server (for testing purposes)
   * @deprecated Use node instead
   */

  /**
   * Save tx receipts and logs in the meta db (default: false)
   */
  saveReceipts?: boolean

  /**
   * Number of recent blocks to maintain transactions index for
   * (default = 2350000 = about one year, 0 = entire chain)
   */
  txLookupLimit?: number

  /**
   * A custom winston logger can be provided
   * if setting logging verbosity is not sufficient
   *
   * Default: Logger with loglevel 'info'
   */
  logger?: Logger

  /**
   * Max items per block or header request
   *
   * Default: `100`
   */
  maxPerRequest?: number

  /**
   * Max jobs to be enqueued in the fetcher at any given time
   *
   * Default: `100`
   */
  maxFetcherJobs?: number

  /**
   * Max outgoing multi-peer requests by the fetcher at any given time
   */
  maxFetcherRequests?: number

  /**
   * Number of peers needed before syncing
   *
   * Default: `1`
   */
  minPeers?: number

  /**
   * Maximum peers allowed
   *
   * Default: `25`
   */
  maxPeers?: number

  /**
   * Start continuous VM execution (pre-Merge setting)
   */
  execution?: boolean

  /**
   * Number of blocks to execute in batch mode and logged to console
   */
  numBlocksPerIteration?: number

  /**
   * Size for the account cache (max number of accounts)
   */
  accountCache?: number

  /**
   * Size for the storage cache (max number of contracts)
   */
  storageCache?: number

  /**
   * Size for the code cache (max number of contracts)
   */
  codeCache?: number

  /**
   * Size for the trie cache (max number of trie nodes)
   */
  trieCache?: number

  /**
   * Generate code for local debugging, currently providing a
   * code snippet which can be used to run blocks on the
   * EthereumJS VM on execution errors
   *
   * (meant to be used internally for the most part)
   */
  debugCode?: boolean

  /**
   * Use v4 ("findneighbour" node requests) for peer discovery
   *
   * Default: `false` for testnets, true for mainnet
   */
  discV4?: boolean

  /**
   * Enable mining
   *
   * Default: `false`
   */
  mine?: boolean

  /**
   * Is a single node and doesn't need peers for synchronization
   *
   * Default: `false`
   */
  isSingleNode?: boolean

  /**
   * Whether to profile VM blocks
   */
  vmProfileBlocks?: boolean

  /**
   * Whether to profile VM txs
   */
  vmProfileTxs?: boolean

  /**
   * Unlocked accounts of form [address, privateKey]
   * Currently only the first account is used to seal mined PoA blocks
   *
   * Default: []
   */
  accounts?: [address: Address, privKey: Uint8Array][]

  /**
   * Address for mining rewards (etherbase)
   * If not provided, defaults to the primary account.
   */
  minerCoinbase?: Address

  /**
   * Minimum gas price for transaction inclusion (in wei)
   * Transactions below this price will be filtered out
   * Default: 1 gwei (1e9 wei)
   */
  minerGasPrice?: bigint

  /**
   * Target gas ceiling for mined blocks
   * Miner will try to fill blocks up to this gas limit
   * Default: parent block's gas limit
   */
  minerGasCeil?: bigint

  /**
   * Extra data to include in block headers
   * Max 32 bytes
   */
  minerExtraData?: Uint8Array

  /**
   * List of addresses to prioritize for transaction inclusion
   * Transactions from these addresses get priority over others
   */
  minerPriorityAddresses?: Address[]

  /**
   * If there is a reorg, this is a safe distance from which
   * to try to refetch and re-feed the blocks.
   */
  safeReorgDistance?: number

  /**
   * The time after which synced state is downgraded to unsynced
   */
  syncedStateRemovalPeriod?: number

  /**
   * Save account keys preimages in the meta db (default: false)
   */
  savePreimages?: boolean

  /**
   * Enables Prometheus Metrics that can be collected for monitoring client health
   * @deprecated Use metrics option instead
   */
  prometheusMetrics?: PrometheusMetrics

  /**
   * Prometheus metrics configuration
   */
  metrics?: MetricsOptions

  /**
   * Rate limiting configuration for RPC server
   */
  rateLimit?: import('../rpc/rate-limit/types').RateLimitOptions

  /**
   * Use the new P2P server implementation with Transport + Mplex + Multi-stream-select
   * instead of the legacy RLPx server (default: false for backward compatibility)
   */
  useP2PServer?: boolean

  node?: P2PNode
}
