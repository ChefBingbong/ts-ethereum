import type { Options } from 'yargs'

/**
 * Node CLI arguments - matches ResolvedConfigOptions from execution-client
 */
export type NodeArgs = {
  // Network / P2P
  p2pPort: number
  rpcPort: number
  metricsPort: number
  chainId: number
  listenIp: string
  announceIp?: string
  bootnode?: string
  discV4: boolean
  minPeers: number
  maxPeers: number

  // Sync
  syncmode: 'full' | 'none'
  safeReorgDistance: number
  syncedStateRemovalPeriod: number

  // Fetcher
  maxPerRequest: number
  maxFetcherJobs: number
  maxFetcherRequests: number
  numBlocksPerIteration: number

  // Mining
  mine: boolean
  minerCoinbase?: string
  minerGasPrice?: string
  minerGasCeil?: string
  minerExtraData?: string

  // Execution
  execution: boolean
  debugCode: boolean
  isSingleNode: boolean

  // Cache
  accountCache: number
  storageCache: number
  codeCache: number
  trieCache: number

  // Storage
  saveReceipts: boolean
  txLookupLimit: number
  prefixStorageTrieKeys: boolean
  useStringValueTrieDB: boolean
  savePreimages: boolean

  // VM Profiler
  vmProfileBlocks: boolean
  vmProfileTxs: boolean

  // Metrics
  metricsEnabled: boolean
  metricsAddress: string
}

export const nodeOptions: Record<keyof NodeArgs, Options> = {
  // ============================================================================
  // Network / P2P
  // ============================================================================
  p2pPort: {
    description: 'P2P listening port',
    type: 'number',
    default: 9000,
    group: 'Network:',
  },
  rpcPort: {
    description: 'JSON-RPC server port',
    type: 'number',
    default: 9300,
    group: 'Network:',
  },
  metricsPort: {
    description: 'Prometheus metrics port',
    type: 'number',
    default: 9400,
    group: 'Network:',
  },
  chainId: {
    description: 'Chain ID for the network',
    type: 'number',
    default: 99999,
    group: 'Network:',
  },
  listenIp: {
    description:
      'IP address to bind/listen on (use 0.0.0.0 for all interfaces)',
    type: 'string',
    default: '0.0.0.0',
    group: 'Network:',
  },
  announceIp: {
    description: 'IP address to advertise to peers (required for Docker/NAT)',
    type: 'string',
    group: 'Network:',
  },
  bootnode: {
    description: 'Bootnode enode URL to connect to',
    type: 'string',
    group: 'Network:',
  },
  discV4: {
    description: 'Enable discv4 peer discovery',
    type: 'boolean',
    default: true,
    group: 'Network:',
  },
  minPeers: {
    description: 'Minimum number of peers to connect to',
    type: 'number',
    default: 1,
    group: 'Network:',
  },
  maxPeers: {
    description: 'Maximum number of peers to connect to',
    type: 'number',
    default: 25,
    group: 'Network:',
  },

  // ============================================================================
  // Sync
  // ============================================================================
  syncmode: {
    description: 'Synchronization mode',
    type: 'string',
    choices: ['full', 'none'],
    default: 'full',
    group: 'Sync:',
  },
  safeReorgDistance: {
    description: 'Safe reorg distance for chain reorganizations',
    type: 'number',
    default: 100,
    group: 'Sync:',
  },
  syncedStateRemovalPeriod: {
    description: 'Period for synced state removal (ms)',
    type: 'number',
    default: 60000,
    group: 'Sync:',
  },

  // ============================================================================
  // Fetcher
  // ============================================================================
  maxPerRequest: {
    description: 'Maximum items per request',
    type: 'number',
    default: 100,
    group: 'Fetcher:',
  },
  maxFetcherJobs: {
    description: 'Maximum concurrent fetcher jobs',
    type: 'number',
    default: 100,
    group: 'Fetcher:',
  },
  maxFetcherRequests: {
    description: 'Maximum concurrent fetcher requests',
    type: 'number',
    default: 5,
    group: 'Fetcher:',
  },
  numBlocksPerIteration: {
    description: 'Number of blocks to process per iteration',
    type: 'number',
    default: 100,
    group: 'Fetcher:',
  },

  // ============================================================================
  // Mining
  // ============================================================================
  mine: {
    description: 'Enable mining',
    type: 'boolean',
    default: false,
    group: 'Mining:',
  },
  minerCoinbase: {
    description: 'Address to receive mining rewards',
    type: 'string',
    group: 'Mining:',
  },
  minerGasPrice: {
    description: 'Gas price for mined transactions (wei)',
    type: 'string',
    group: 'Mining:',
  },
  minerGasCeil: {
    description: 'Gas ceiling for blocks',
    type: 'string',
    group: 'Mining:',
  },
  minerExtraData: {
    description: 'Extra data to include in mined blocks (hex)',
    type: 'string',
    group: 'Mining:',
  },

  // ============================================================================
  // Execution
  // ============================================================================
  execution: {
    description: 'Enable block execution',
    type: 'boolean',
    default: true,
    group: 'Execution:',
  },
  debugCode: {
    description: 'Enable debug code in EVM',
    type: 'boolean',
    default: false,
    group: 'Execution:',
  },
  isSingleNode: {
    description: 'Run as single node (no peer requirements)',
    type: 'boolean',
    default: false,
    group: 'Execution:',
  },

  // ============================================================================
  // Cache
  // ============================================================================
  accountCache: {
    description: 'Account cache size',
    type: 'number',
    default: 400000,
    group: 'Cache:',
  },
  storageCache: {
    description: 'Storage cache size',
    type: 'number',
    default: 200000,
    group: 'Cache:',
  },
  codeCache: {
    description: 'Code cache size',
    type: 'number',
    default: 200000,
    group: 'Cache:',
  },
  trieCache: {
    description: 'Trie cache size',
    type: 'number',
    default: 200000,
    group: 'Cache:',
  },

  // ============================================================================
  // Storage
  // ============================================================================
  saveReceipts: {
    description: 'Save transaction receipts',
    type: 'boolean',
    default: true,
    group: 'Storage:',
  },
  txLookupLimit: {
    description: 'Transaction lookup limit (number of blocks)',
    type: 'number',
    default: 2350000,
    group: 'Storage:',
  },
  prefixStorageTrieKeys: {
    description: 'Prefix storage trie keys',
    type: 'boolean',
    default: true,
    group: 'Storage:',
  },
  useStringValueTrieDB: {
    description: 'Use string values in trie DB',
    type: 'boolean',
    default: false,
    group: 'Storage:',
  },
  savePreimages: {
    description: 'Save preimages',
    type: 'boolean',
    default: true,
    group: 'Storage:',
  },

  // ============================================================================
  // VM Profiler
  // ============================================================================
  vmProfileBlocks: {
    description: 'Enable VM profiling for blocks',
    type: 'boolean',
    default: false,
    group: 'Profiler:',
  },
  vmProfileTxs: {
    description: 'Enable VM profiling for transactions',
    type: 'boolean',
    default: false,
    group: 'Profiler:',
  },

  // ============================================================================
  // Metrics
  // ============================================================================
  metricsEnabled: {
    description: 'Enable metrics server',
    type: 'boolean',
    default: true,
    group: 'Metrics:',
  },
  metricsAddress: {
    description: 'Metrics server bind address',
    type: 'string',
    default: '0.0.0.0',
    group: 'Metrics:',
  },
}
