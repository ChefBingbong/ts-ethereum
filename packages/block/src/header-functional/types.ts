import type {
  AllParamNames,
  HardforkManager,
  ParamType,
} from '@ts-ethereum/chain-config'
import type { Address, PrefixedHexString } from '@ts-ethereum/utils'
import type { BlockHeaderBytes, JSONHeader } from '../types'

// Re-export BlockHeaderBytes for use in header-manager
export type { BlockHeaderBytes }

/**
 * Core header fields that are always present.
 */
export interface CoreHeaderFields {
  readonly parentHash: Uint8Array
  readonly uncleHash: Uint8Array
  readonly coinbase: Address
  readonly stateRoot: Uint8Array
  readonly transactionsTrie: Uint8Array
  readonly receiptTrie: Uint8Array
  readonly logsBloom: Uint8Array
  readonly difficulty: bigint
  readonly number: bigint
  readonly gasLimit: bigint
  readonly gasUsed: bigint
  readonly timestamp: bigint
  readonly extraData: Uint8Array
  readonly mixHash: Uint8Array
  readonly nonce: Uint8Array
}

/**
 * EIP-specific optional header fields.
 */
export interface EIPHeaderFields {
  readonly baseFeePerGas?: bigint
  readonly withdrawalsRoot?: Uint8Array
  readonly blobGasUsed?: bigint
  readonly excessBlobGas?: bigint
  readonly parentBeaconBlockRoot?: Uint8Array
  readonly requestsHash?: Uint8Array
}

/**
 * Complete validated header data combining core and EIP fields.
 */
export interface ValidatedHeaderData
  extends CoreHeaderFields,
    EIPHeaderFields {}

/**
 * Immutable block header state containing validated data and computed caches.
 */
export interface FrozenBlockHeader {
  readonly data: ValidatedHeaderData
  readonly hardforkManager: HardforkManager
  readonly _cache: {
    readonly hash: Uint8Array | undefined
  }
}

/**
 * Options for creating a block header.
 */
export interface CreateHeaderOptions {
  readonly hardforkManager: HardforkManager
  readonly calcDifficultyFromHeader?: ParentHeaderData
  readonly skipConsensusFormatValidation?: boolean
  readonly freeze?: boolean
}

/**
 * Parent header data used for difficulty calculation.
 */
export interface ParentHeaderData {
  readonly timestamp: bigint
  readonly difficulty: bigint
  readonly uncleHash: Uint8Array
  readonly gasLimit?: bigint
}

/**
 * Block number context for hardfork lookups.
 */
export interface BlockNumContext {
  readonly blockNumber: bigint
  readonly timestamp: bigint
}

/**
 * JSON header output format.
 */
export type { JSONHeader }

/**
 * JSON-RPC block header with all fields.
 */
export interface JSONRPCHeaderInput {
  readonly parentHash: PrefixedHexString
  readonly sha3Uncles: PrefixedHexString
  readonly miner: PrefixedHexString
  readonly stateRoot: PrefixedHexString
  readonly transactionsRoot: PrefixedHexString
  readonly receiptsRoot: PrefixedHexString
  readonly logsBloom: PrefixedHexString
  readonly difficulty: PrefixedHexString | string
  readonly number: PrefixedHexString
  readonly gasLimit: PrefixedHexString
  readonly gasUsed: PrefixedHexString
  readonly timestamp: PrefixedHexString
  readonly extraData: PrefixedHexString
  readonly mixHash?: PrefixedHexString
  readonly nonce: PrefixedHexString
  readonly baseFeePerGas?: PrefixedHexString
  readonly withdrawalsRoot?: PrefixedHexString
  readonly blobGasUsed?: PrefixedHexString
  readonly excessBlobGas?: PrefixedHexString
  readonly parentBeaconBlockRoot?: PrefixedHexString
  readonly requestsHash?: PrefixedHexString
}

/**
 * Immutable block header manager interface.
 * Provides a purely functional API for working with block headers.
 * Also includes convenience properties for backward compatibility with the old BlockHeader class.
 */
export interface BlockHeaderManager {
  readonly header: FrozenBlockHeader

  // Backward compatibility properties (matching old BlockHeader class)
  readonly parentHash: Uint8Array
  readonly uncleHash: Uint8Array
  readonly coinbase: Address
  readonly stateRoot: Uint8Array
  readonly transactionsTrie: Uint8Array
  readonly receiptTrie: Uint8Array
  readonly logsBloom: Uint8Array
  readonly difficulty: bigint
  readonly number: bigint
  readonly gasLimit: bigint
  readonly gasUsed: bigint
  readonly timestamp: bigint
  readonly extraData: Uint8Array
  readonly mixHash: Uint8Array
  readonly nonce: Uint8Array
  readonly baseFeePerGas?: bigint
  readonly withdrawalsRoot?: Uint8Array
  readonly blobGasUsed?: bigint
  readonly excessBlobGas?: bigint
  readonly parentBeaconBlockRoot?: Uint8Array
  readonly requestsHash?: Uint8Array
  readonly hardforkManager: HardforkManager
  readonly blockNum: BlockNumContext
  readonly hardfork: string
  readonly consensusType: string
  readonly consensusAlgorithm: string
  readonly prevRandao: Uint8Array

  // EIP helpers
  isEIPActive(eip: number): boolean
  param<P extends AllParamNames>(name: P): ParamType<P> | undefined

  // Gas calculations
  validateGasLimit(parentGasLimit: bigint): void
  calcNextBaseFee(): bigint
  getBlobGasPrice(): bigint
  calcDataFee(numBlobs: number): bigint
  calcNextExcessBlobGas(childHardfork: string): bigint
  calcNextBlobGasPrice(childHardfork: string): bigint

  // Difficulty
  ethashCanonicalDifficulty(
    parentBlockHeader: ParentHeaderData | undefined,
  ): bigint

  // Serialization
  raw(): BlockHeaderBytes
  hash(): Uint8Array
  serialize(): Uint8Array
  toJSON(): JSONHeader

  // Utility
  isGenesis(): boolean
}
