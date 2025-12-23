import { Common } from '@ts-ethereum/chain-config'
import { PeerInfo } from '@ts-ethereum/kademlia'
import {
  defaultMetricsOptions,
  type MetricsOptions,
} from '@ts-ethereum/metrics'
import { Address, genPrivateKey } from '@ts-ethereum/utils'
import type { VM, VMProfilerOpts } from '@ts-ethereum/vm'
import { Logger } from '../logging'
import * as constants from './constants'
import type { ConfigOptions, SyncMode } from './types'

/**
 * Resolved config options with all defaults applied
 */
export interface ResolvedConfigOptions {
  readonly syncmode: SyncMode
  readonly vm?: VM
  readonly datadir: string
  readonly key: Uint8Array
  readonly bootnodes?: readonly PeerInfo[]
  readonly port?: number
  readonly extIP?: string
  readonly saveReceipts: boolean
  readonly txLookupLimit: number
  readonly maxPerRequest: number
  readonly maxFetcherJobs: number
  readonly maxFetcherRequests: number
  readonly minPeers: number
  readonly maxPeers: number
  readonly execution: boolean
  readonly numBlocksPerIteration: number
  readonly accountCache: number
  readonly storageCache: number
  readonly codeCache: number
  readonly trieCache: number
  readonly debugCode: boolean
  readonly discV4: boolean
  readonly mine: boolean
  readonly isSingleNode: boolean
  readonly accounts: readonly [address: Address, privKey: Uint8Array][]
  readonly minerCoinbase?: Address
  readonly vmProfilerOpts?: VMProfilerOpts
  readonly safeReorgDistance: number
  readonly syncedStateRemovalPeriod: number
  readonly prefixStorageTrieKeys: boolean
  readonly useStringValueTrieDB: boolean
  readonly savePreimages: boolean
  readonly metrics?: MetricsOptions
  readonly rateLimit?: import('../rpc/rate-limit/types').RateLimitOptions
  readonly common: Common
  readonly logger?: Logger
}

/**
 * Create config options with all defaults applied
 */
export function createConfigFromDefaults(
  common: Common,
): ResolvedConfigOptions {
  return {
    syncmode: constants.SYNCMODE_DEFAULT,
    datadir: constants.DATADIR_DEFAULT,
    key: genPrivateKey(),
    port: constants.PORT_DEFAULT,
    saveReceipts: true,
    txLookupLimit: constants.TX_LOOKUP_LIMIT_DEFAULT,
    maxPerRequest: constants.MAXPERREQUEST_DEFAULT,
    maxFetcherJobs: constants.MAXFETCHERJOBS_DEFAULT,
    maxFetcherRequests: constants.MAXFETCHERREQUESTS_DEFAULT,
    minPeers: constants.MINPEERS_DEFAULT,
    maxPeers: constants.MAXPEERS_DEFAULT,
    execution: constants.EXECUTION,
    numBlocksPerIteration: constants.NUM_BLOCKS_PER_ITERATION,
    accountCache: constants.ACCOUNT_CACHE,
    storageCache: constants.STORAGE_CACHE,
    codeCache: constants.CODE_CACHE,
    trieCache: constants.TRIE_CACHE,
    debugCode: constants.DEBUGCODE_DEFAULT,
    discV4: true,
    mine: false,
    isSingleNode: false,
    accounts: [],
    safeReorgDistance: constants.SAFE_REORG_DISTANCE,
    syncedStateRemovalPeriod: constants.SYNCED_STATE_REMOVAL_PERIOD,
    prefixStorageTrieKeys: true,
    useStringValueTrieDB: false,
    savePreimages: false,
    common,
    metrics: defaultMetricsOptions,
  }
}

/**
 * Create config options from user-provided options, applying defaults
 */
export function createConfigOptions(
  options: ConfigOptions,
): ResolvedConfigOptions {
  const defaults = createConfigFromDefaults(options.common)

  return {
    syncmode: options.syncmode ?? defaults.syncmode,
    vm: options.vm,
    datadir: options.datadir ?? defaults.datadir,
    key: options.key ?? defaults.key,
    bootnodes: options.bootnodes,
    port: options.port ?? defaults.port,
    extIP: options.extIP,
    saveReceipts: options.saveReceipts ?? defaults.saveReceipts,
    txLookupLimit: options.txLookupLimit ?? defaults.txLookupLimit,
    maxPerRequest: options.maxPerRequest ?? defaults.maxPerRequest,
    maxFetcherJobs: options.maxFetcherJobs ?? defaults.maxFetcherJobs,
    maxFetcherRequests:
      options.maxFetcherRequests ?? defaults.maxFetcherRequests,
    minPeers: options.minPeers ?? defaults.minPeers,
    maxPeers: options.maxPeers ?? defaults.maxPeers,
    execution: options.execution ?? defaults.execution,
    numBlocksPerIteration:
      options.numBlocksPerIteration ?? defaults.numBlocksPerIteration,
    accountCache: options.accountCache ?? defaults.accountCache,
    storageCache: options.storageCache ?? defaults.storageCache,
    codeCache: options.codeCache ?? defaults.codeCache,
    trieCache: options.trieCache ?? defaults.trieCache,
    debugCode: options.debugCode ?? defaults.debugCode,
    discV4: options.discV4 ?? defaults.discV4,
    mine: options.mine ?? defaults.mine,
    isSingleNode: options.isSingleNode ?? defaults.isSingleNode,
    accounts: options.accounts ?? defaults.accounts,
    minerCoinbase: options.minerCoinbase,
    vmProfilerOpts:
      options.vmProfileBlocks !== undefined ||
      options.vmProfileTxs !== undefined
        ? {
            reportAfterBlock: options.vmProfileBlocks !== false,
            reportAfterTx: options.vmProfileTxs !== false,
          }
        : undefined,
    safeReorgDistance: options.safeReorgDistance ?? defaults.safeReorgDistance,
    syncedStateRemovalPeriod:
      options.syncedStateRemovalPeriod ?? defaults.syncedStateRemovalPeriod,
    prefixStorageTrieKeys:
      options.prefixStorageTrieKeys ?? defaults.prefixStorageTrieKeys,
    useStringValueTrieDB:
      options.useStringValueTrieDB ?? defaults.useStringValueTrieDB,
    savePreimages: options.savePreimages ?? defaults.savePreimages,
    metrics: options.metrics ?? defaultMetricsOptions,
    rateLimit: options.rateLimit,
    common: options.common ?? defaults.common,
    logger: options.logger ?? defaults.logger,
  }
}

export const timestampToMilliseconds = (timestamp?: bigint) => {
  if (!timestamp) return Date.now()
  return Number(timestamp) * 1000
}
