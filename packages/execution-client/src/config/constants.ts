import { BIGINT_1, BIGINT_2, BIGINT_256 } from '@ts-ethereum/utils'
import { SyncMode } from './types'

export const SYNCMODE_DEFAULT = SyncMode.Full
export const DATADIR_DEFAULT = `./datadir`
export const PORT_DEFAULT = 30303
export const MAXPERREQUEST_DEFAULT = 100
export const MAXFETCHERJOBS_DEFAULT = 100
export const MAXFETCHERREQUESTS_DEFAULT = 5
export const MINPEERS_DEFAULT = 1
export const MAXPEERS_DEFAULT = 25
export const EXECUTION = true
export const NUM_BLOCKS_PER_ITERATION = 100
export const ACCOUNT_CACHE = 400000
export const STORAGE_CACHE = 200000
export const CODE_CACHE = 200000
export const TRIE_CACHE = 200000
export const DEBUGCODE_DEFAULT = false
export const SAFE_REORG_DISTANCE = 100
export const TX_LOOKUP_LIMIT_DEFAULT = 2350000
export const MAX_RANGE_BYTES = 50000
export const SKELETON_FILL_CANONICAL_BACKSTEP = 100
export const SKELETON_SUBCHAIN_MERGE_MINIMUM = 1000
export const MAX_INVALID_BLOCKS_ERROR_CACHE = 128
export const PRUNE_ENGINE_CACHE = true
export const SYNCED_STATE_REMOVAL_PERIOD = 60000
export const ENGINE_PARENT_LOOKUP_MAX_DEPTH = 128
export const ENGINE_NEWPAYLOAD_MAX_EXECUTE = 2
export const ENGINE_NEWPAYLOAD_MAX_TXS_EXECUTE = 200
export const SNAP_AVAILABILITY_DEPTH = BigInt(128)
export const SNAP_TRANSITION_SAFE_DEPTH = BigInt(5)
export const MAX_ACCOUNT_RANGE =
  (BIGINT_2 ** BIGINT_256 - BIGINT_1) / BigInt(1_000)
export const MAX_STORAGE_RANGE =
  (BIGINT_2 ** BIGINT_256 - BIGINT_1) / BigInt(10)
