import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { PeerInfo } from '@ts-ethereum/kademlia'
import {
  defaultMetricsOptions,
  type MetricsOptions,
} from '@ts-ethereum/metrics'
import { type Address, genPrivateKey } from '@ts-ethereum/utils'
import type { VM, VMProfilerOpts } from '@ts-ethereum/vm'
import type { Logger } from '../logging'
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
  readonly minerGasPrice?: bigint
  readonly minerGasCeil?: bigint
  readonly minerExtraData?: Uint8Array
  readonly minerPriorityAddresses?: readonly Address[]
  readonly vmProfilerOpts?: VMProfilerOpts
  readonly safeReorgDistance: number
  readonly syncedStateRemovalPeriod: number
  readonly prefixStorageTrieKeys: boolean
  readonly useStringValueTrieDB: boolean
  readonly savePreimages: boolean
  readonly metrics?: MetricsOptions
  readonly rateLimit?: import('../rpc/rate-limit/types').RateLimitOptions
  readonly common: HardforkManager
  readonly logger?: Logger
  readonly skeletonFillCanonicalBackStep: number
  readonly skeletonSubchainMergeMinimum: number
  readonly maxRangeBytes: number
  readonly maxAccountRange: bigint
  readonly maxStorageRange: bigint
  readonly maxInvalidBlocksErrorCache: number
  readonly pruneEngineCache: boolean
  readonly engineParentLookupMaxDepth: number
  readonly engineNewpayloadMaxExecute: number
  readonly engineNewpayloadMaxTxsExecute: number
  readonly snapAvailabilityDepth: bigint
  readonly snapTransitionSafeDepth: bigint

  // Defaulting to false as experimental as of now
  readonly enableSnapSync: boolean
}

/**
 * Create config options with all defaults applied
 */
export function createConfigFromDefaults(
  common: HardforkManager,
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
    common,
    metrics: defaultMetricsOptions,
    skeletonFillCanonicalBackStep: constants.SKELETON_FILL_CANONICAL_BACKSTEP,
    skeletonSubchainMergeMinimum: constants.SKELETON_SUBCHAIN_MERGE_MINIMUM,
    maxRangeBytes: constants.MAX_RANGE_BYTES,
    maxAccountRange: constants.MAX_ACCOUNT_RANGE,
    maxStorageRange: constants.MAX_STORAGE_RANGE,
    maxInvalidBlocksErrorCache: constants.MAX_INVALID_BLOCKS_ERROR_CACHE,
    pruneEngineCache: constants.PRUNE_ENGINE_CACHE,
    engineParentLookupMaxDepth: constants.ENGINE_PARENT_LOOKUP_MAX_DEPTH,
    engineNewpayloadMaxExecute: constants.ENGINE_NEWPAYLOAD_MAX_EXECUTE,
    engineNewpayloadMaxTxsExecute: constants.ENGINE_NEWPAYLOAD_MAX_TXS_EXECUTE,
    snapAvailabilityDepth: constants.SNAP_AVAILABILITY_DEPTH,
    snapTransitionSafeDepth: constants.SNAP_TRANSITION_SAFE_DEPTH,
    enableSnapSync: false,
    useStringValueTrieDB: false,
    savePreimages: true,
  }
}

/**
 * Create config options from user-provided options, applying defaults
 */
export function createConfigOptions(
  options: ConfigOptions,
): ResolvedConfigOptions {
  const defaults = createConfigFromDefaults(options.hardforkManager)

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
    minerGasPrice: options.minerGasPrice,
    minerGasCeil: options.minerGasCeil,
    minerExtraData: options.minerExtraData,
    minerPriorityAddresses: options.minerPriorityAddresses,
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
    common: options.hardforkManager ?? defaults.common,
    logger: options.logger ?? defaults.logger,

    skeletonFillCanonicalBackStep:
      options.skeletonFillCanonicalBackStep ??
      defaults.skeletonFillCanonicalBackStep,
    skeletonSubchainMergeMinimum:
      options.skeletonSubchainMergeMinimum ??
      defaults.skeletonSubchainMergeMinimum,
    maxRangeBytes: options.maxRangeBytes ?? defaults.maxRangeBytes,
    maxAccountRange: options.maxAccountRange ?? defaults.maxAccountRange,
    maxStorageRange: options.maxStorageRange ?? defaults.maxStorageRange,
    maxInvalidBlocksErrorCache:
      options.maxInvalidBlocksErrorCache ?? defaults.maxInvalidBlocksErrorCache,
    pruneEngineCache: options.pruneEngineCache ?? defaults.pruneEngineCache,
    engineParentLookupMaxDepth:
      options.engineParentLookupMaxDepth ?? defaults.engineParentLookupMaxDepth,
    engineNewpayloadMaxExecute:
      options.engineNewpayloadMaxExecute ?? defaults.engineNewpayloadMaxExecute,
    engineNewpayloadMaxTxsExecute:
      options.engineNewpayloadMaxTxsExecute ??
      defaults.engineNewpayloadMaxTxsExecute,
    snapAvailabilityDepth:
      options.snapAvailabilityDepth ?? defaults.snapAvailabilityDepth,
    snapTransitionSafeDepth:
      options.snapTransitionSafeDepth ?? defaults.snapTransitionSafeDepth,
    enableSnapSync: options.enableSnapSync ?? defaults.enableSnapSync,
  }
}

export const timestampToMilliseconds = (timestamp?: bigint) => {
  if (!timestamp) return Date.now()
  return Number(timestamp) * 1000
}
