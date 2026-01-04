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

export interface HardforkManager {
  readonly config: FrozenChainConfig
  chainId(): bigint
  chainName(): string
  getHardforkByBlock(blockNumber: bigint, timestamp?: bigint): string
  isEIPActiveAtHardfork(eip: number, hardfork: string): boolean
  isEIPActiveAtBlock(
    eip: number,
    blockNum: { blockNumber: bigint; timestamp?: bigint },
  ): boolean
  getParamAtHardfork<P extends AllParamNames>(
    param: P,
    hardfork: string,
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
