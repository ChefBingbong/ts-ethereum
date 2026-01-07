import type {
  AllParamNames,
  HardforkParamsMap,
  ParamsAtHardfork,
  ParamType,
} from '../../hardforks/params'
import type { ChainConfig } from '../../types'

export interface HardforkEntry {
  readonly name: string
  readonly block: bigint | null
  readonly timestamp?: string | number
  readonly optional?: boolean
  readonly forkHash?: string
}

export interface ChainSpec {
  readonly hardforks: readonly HardforkEntry[]
  readonly chainId: bigint
  readonly chain: ChainConfig
}

export interface FrozenChainConfig {
  readonly spec: ChainSpec
  readonly _hardforkIndex: ReadonlyMap<string, number>
  readonly _eipToHardfork: ReadonlyMap<number, string>
  readonly _cumulativeEips: ReadonlyMap<string, ReadonlySet<number>>
}

export type HardforkContext =
  | string // Hardfork identifier
  | { blockNumber: bigint; timestamp?: bigint } // Block context
  | undefined // Use latest hardfork

export interface HardforkManager {
  readonly config: FrozenChainConfig
  chainId(): bigint
  chainName(): string

  /**
   * Get the latest/most permissive hardfork configured in the chain.
   * This is useful when blockNumber/timestamp aren't available (like geth's LatestSigner pattern).
   */
  getLatestHardfork(): string

  /**
   * Get hardfork by block number and optional timestamp.
   * If blockNumber is not provided, returns the latest hardfork.
   */
  getHardforkByBlock(blockNumber?: bigint, timestamp?: bigint): string

  /**
   * Get hardfork from context. Accepts:
   * - Hardfork identifier (string): returns that hardfork
   * - Block context ({ blockNumber, timestamp? }): determines hardfork from block context
   * - undefined: returns latest/most permissive hardfork
   */
  getHardforkFromContext(context?: HardforkContext): string

  isEIPActiveAtHardfork(eip: number, hardfork: string): boolean

  /**
   * Check if EIP is active at block context, or fallback to latest hardfork if not provided.
   */
  isEIPActiveAtBlock(
    eip: number,
    blockNum?: { blockNumber: bigint; timestamp?: bigint },
  ): boolean

  /**
   * Get parameter at hardfork. Accepts:
   * - Hardfork identifier (string): uses that specific hardfork
   * - Block context ({ blockNumber, timestamp? }): determines hardfork from block context
   * - undefined: uses latest/most permissive hardfork
   */
  getParamAtHardfork<P extends AllParamNames>(
    param: P,
    context?: HardforkContext,
  ): ParamType<P> | undefined

  /**
   * Get all params active at a specific hardfork.
   * Returns strongly typed params when hardfork is a known literal type.
   */
  getParamsAtHardfork<H extends keyof HardforkParamsMap>(
    hardfork: H,
  ): ParamsAtHardfork<H>
  // getParamsAtHardfork(hardfork: string): Record<string, ParamValue>

  hardforkGte(hardfork: string, target: string): boolean
  hardforkBlock(hardfork: string): bigint | null
  hardforkTimestamp(hardfork: string): bigint | undefined
  getActiveEips(hardfork: string): readonly number[]
  getHardforkForEIP(eip: number): string | undefined
  hardforks(): readonly HardforkEntry[]
  genesis(): ChainConfig['genesis'] | undefined
}

export type ExtractHardforkNames<T extends ChainSpec> =
  T['hardforks'][number]['name']
