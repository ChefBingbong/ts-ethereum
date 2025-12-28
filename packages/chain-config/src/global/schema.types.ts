/**
 * Unified Chain Schema Type Definitions
 *
 * This module provides the type system for defining chain schemas that serve as
 * the single source of truth for hardforks, EIPs, and params.
 *
 * Key concepts:
 * - ChainSchemaDef: The full chain schema with hardforks containing EIPs
 * - HardforkWithEIPs: A hardfork entry that declares its EIPs
 * - InferParamsFromSchema: Derives available params from schema EIPs
 */

import type { ConsensusAlgorithm, ConsensusType } from '../fork-params/enums'
import type { EIPParamsMap } from './types'

// ============================================================================
// Hardfork Schema Entry
// ============================================================================

/**
 * A hardfork entry with embedded EIPs.
 * This is the core building block - each hardfork declares which EIPs it activates.
 *
 * @typeParam Name - The hardfork name literal (e.g., 'london', 'cancun')
 * @typeParam EIPs - Tuple of EIP numbers activated by this hardfork
 *
 * @example
 * ```ts
 * const londonFork: HardforkWithEIPs<'london', readonly [1559, 3198, 3529]> = {
 *   name: 'london',
 *   block: 12965000n,
 *   eips: [1559, 3198, 3529] as const,
 * }
 * ```
 */
export interface HardforkWithEIPs<
  Name extends string = string,
  EIPs extends readonly number[] = readonly number[],
> {
  /** Hardfork name - must be unique within the schema */
  readonly name: Name
  /** Block number for activation (null = timestamp-based) */
  readonly block: bigint | null
  /** Timestamp for activation (for post-merge forks) */
  readonly timestamp?: number | string
  /** Fork hash for network identification */
  readonly forkHash?: string | null
  /** Whether this fork is optional */
  readonly optional?: boolean
  /** EIPs activated by this hardfork */
  readonly eips: EIPs
}

// ============================================================================
// Genesis & Consensus Config
// ============================================================================

/**
 * Genesis block configuration fields.
 */
export interface GenesisSchemaConfig {
  /** Initial gas limit */
  readonly gasLimit: bigint | number | `0x${string}`
  /** Initial difficulty */
  readonly difficulty: bigint | number | `0x${string}`
  /** Genesis nonce (hex string) */
  readonly nonce: `0x${string}`
  /** Extra data in genesis block */
  readonly extraData: `0x${string}`
  /** Genesis timestamp */
  readonly timestamp?: `0x${string}`
  /** Initial base fee (post-London) */
  readonly baseFeePerGas?: `0x${string}` | bigint
  /** Excess blob gas (post-Cancun) */
  readonly excessBlobGas?: `0x${string}` | bigint
  /** Requests hash (post-Prague) */
  readonly requestsHash?: `0x${string}`
}

/**
 * Consensus mechanism configuration.
 */
export interface ConsensusSchemaConfig {
  /** Consensus type: 'pow', 'pos', or 'poa' */
  readonly type: ConsensusType | string
  /** Consensus algorithm: 'ethash', 'clique', or 'casper' */
  readonly algorithm: ConsensusAlgorithm | string
  /** Clique-specific config */
  readonly clique?: {
    readonly period: number
    readonly epoch: number
  }
  /** Ethash-specific config */
  readonly ethash?: Record<string, unknown>
  /** Casper-specific config */
  readonly casper?: Record<string, unknown>
}

// ============================================================================
// Full Chain Schema Definition
// ============================================================================

/**
 * Full chain schema definition - the single source of truth.
 *
 * This schema contains everything needed to configure a chain:
 * - Chain identity (name, chainId)
 * - Genesis block configuration
 * - Consensus mechanism
 * - Hardforks with their EIPs
 *
 * @typeParam HFs - The hardforks tuple type (for type inference)
 *
 * @example
 * ```ts
 * const myChain: ChainSchemaDef = {
 *   chainId: 1n,
 *   name: 'mainnet',
 *   genesis: { ... },
 *   consensus: { type: 'pow', algorithm: 'ethash' },
 *   hardforks: [
 *     { name: 'chainstart', block: 0n, eips: [1] as const },
 *     { name: 'london', block: 12965000n, eips: [1559, 3198, 3529] as const },
 *   ] as const,
 * }
 * ```
 */
export interface ChainSchemaDef<
  HFs extends readonly HardforkWithEIPs[] = readonly HardforkWithEIPs[],
> {
  /** Chain ID for replay protection */
  readonly chainId: bigint
  /** Human-readable chain name */
  readonly name: string
  /** Optional chain description */
  readonly comment?: string
  /** Optional chain info URL */
  readonly url?: string
  /** Genesis block configuration */
  readonly genesis: GenesisSchemaConfig
  /** Consensus mechanism configuration */
  readonly consensus: ConsensusSchemaConfig
  /** Hardfork transitions with EIPs */
  readonly hardforks: HFs
  /** Bootstrap node addresses */
  readonly bootstrapNodes?: readonly BootstrapNodeConfig[]
  /** DNS network discovery addresses */
  readonly dnsNetworks?: readonly string[]
  /** Deposit contract address (for PoS chains) */
  readonly depositContractAddress?: `0x${string}`
}

// Import BootstrapNodeConfig from main types to avoid duplication
import type { BootstrapNodeConfig } from '../types'
export type { BootstrapNodeConfig }

// ============================================================================
// Type Extraction Utilities
// ============================================================================

/**
 * Extract all EIP numbers from a hardforks array.
 * This collects ALL EIPs across all hardforks in the schema.
 *
 * @example
 * ```ts
 * type HFs = [
 *   { name: 'chainstart'; eips: readonly [1] },
 *   { name: 'london'; eips: readonly [1559, 3198] },
 * ]
 * type AllEIPs = ExtractEIPsFromHardforks<HFs>
 * // = 1 | 1559 | 3198
 * ```
 */
export type ExtractEIPsFromHardforks<HFs extends readonly HardforkWithEIPs[]> =
  HFs[number]['eips'][number]

/**
 * Extract hardfork names from a HardforkWithEIPs array.
 * Named differently from param-manager's ExtractHardforkNames to avoid conflicts.
 *
 * @example
 * ```ts
 * type HFs = [
 *   { name: 'chainstart'; ... },
 *   { name: 'london'; ... },
 * ]
 * type Names = ExtractSchemaHardforkNames<HFs>
 * // = 'chainstart' | 'london'
 * ```
 */
export type ExtractSchemaHardforkNames<
  HFs extends readonly HardforkWithEIPs[],
> = HFs[number]['name']

/**
 * Extract EIPs from a specific hardfork by name.
 */
export type ExtractEIPsForHardfork<
  HFs extends readonly HardforkWithEIPs[],
  Name extends string,
> = Extract<HFs[number], { name: Name }>['eips'][number]

// ============================================================================
// Param Inference from EIPs
// ============================================================================

/**
 * Helper to convert union to intersection.
 * Used to merge multiple EIP param interfaces into one.
 */
export type UnionToIntersection<U> = (
  U extends unknown
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never

/**
 * Infer merged params from a union of EIP numbers.
 * Maps each EIP to its params interface, then intersects them.
 *
 * @example
 * ```ts
 * type Params = InferParamsFromEIPs<1 | 1559 | 3198>
 * // = EIP1Params & EIP1559Params & EIP3198Params
 * ```
 */
export type InferParamsFromEIPs<EIPs extends number> = UnionToIntersection<
  EIPs extends keyof EIPParamsMap ? EIPParamsMap[EIPs] : never
>

/**
 * Main inference type: Schema -> Available Params.
 * Extracts all EIPs from the schema's hardforks and infers their params.
 *
 * @example
 * ```ts
 * const schema = createChainSchema({
 *   hardforks: [
 *     { name: 'chainstart', block: 0n, eips: [1] as const },
 *     { name: 'london', block: 100n, eips: [1559, 3198] as const },
 *   ] as const,
 *   // ...
 * } as const)
 *
 * type Params = InferParamsFromSchema<typeof schema>
 * // = EIP1Params & EIP1559Params & EIP3198Params
 * ```
 */
export type InferParamsFromSchema<S extends ChainSchemaDef> =
  InferParamsFromEIPs<ExtractEIPsFromHardforks<S['hardforks']>>

/**
 * Infer hardfork names from a schema.
 */
export type InferHardforkNames<S extends ChainSchemaDef> =
  ExtractSchemaHardforkNames<S['hardforks']>

// ============================================================================
// Cumulative EIP Types (for runtime hardfork)
// ============================================================================

/**
 * Get EIPs active at a specific hardfork index.
 * Accumulates all EIPs from hardforks up to and including the given index.
 */
export type CumulativeEIPsUpToIndex<
  HFs extends readonly HardforkWithEIPs[],
  Index extends number,
  Acc extends number = never,
  CurrentIndex extends number[] = [],
> = CurrentIndex['length'] extends Index
  ? Acc | HFs[CurrentIndex['length']]['eips'][number]
  : CurrentIndex['length'] extends HFs['length']
    ? Acc
    : CumulativeEIPsUpToIndex<
        HFs,
        Index,
        Acc | HFs[CurrentIndex['length']]['eips'][number],
        [...CurrentIndex, 0]
      >

/**
 * Infer params available at a specific hardfork within the schema.
 * Only includes params from EIPs activated at or before that hardfork.
 */
export type InferParamsAtHardfork<
  S extends ChainSchemaDef,
  HF extends ExtractSchemaHardforkNames<S['hardforks']>,
> = InferParamsFromEIPs<
  ExtractEIPsFromHardforks<
    // Filter hardforks up to and including HF
    S['hardforks']
  >
>

// ============================================================================
// Schema Validation Types
// ============================================================================

/**
 * Validated hardfork entry - ensures EIPs array is readonly.
 */
export type ValidatedHardforkWithEIPs<T extends HardforkWithEIPs> =
  T extends HardforkWithEIPs<infer Name, infer EIPs>
    ? EIPs extends readonly number[]
      ? HardforkWithEIPs<Name, EIPs>
      : never
    : never

/**
 * Validated schema - ensures all hardforks are properly typed.
 */
export type ValidatedChainSchemaDef<T extends ChainSchemaDef> =
  T extends ChainSchemaDef<infer HFs>
    ? HFs extends readonly HardforkWithEIPs[]
      ? ChainSchemaDef<HFs>
      : never
    : never
