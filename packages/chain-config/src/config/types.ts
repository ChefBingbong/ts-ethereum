import type { HARDFORK_EIPS, Hardfork } from '../hardforks/hardforks'
import type {
  AllEIPParams,
  AllParamNames,
  EIPWithParams,
  ParamValue,
} from '../hardforks/params'
import type { ChainConfig, CustomCrypto, ParamsConfig } from '../types'
import type { ParamsManager } from './param-manager'

export type { EIPWithParams } from '../hardforks/params'

export type EIPWithHardfork = (typeof HARDFORK_EIPS)[Hardfork][number]

export type EIPParamKeys<E extends EIPWithParams> = keyof AllEIPParams[E]

export type EIPParamType<
  E extends EIPWithParams,
  K extends EIPParamKeys<E>,
> = AllEIPParams[E][K]

export type IsEIPActiveAt<
  E extends number,
  H extends Hardfork,
> = E extends (typeof HARDFORK_EIPS)[H][number] ? true : false

export type MinHardforkFor = {
  [E in EIPWithHardfork]: {
    [H in Hardfork]: E extends (typeof HARDFORK_EIPS)[H][number] ? H : never
  }[Hardfork]
}

export type ParamsOverrides = Partial<Record<AllParamNames, ParamValue>>

export interface ParamsManagerOptions {
  overrides?: ParamsOverrides
}

export interface HardforkSchemaEntry<Name extends string = string> {
  readonly name: Name
  readonly block: bigint | null
  readonly timestamp?: number | string
  readonly forkHash?: string | null
  readonly optional?: boolean
}

export type ExtractHardforkNames<
  T extends readonly HardforkSchemaEntry<string>[],
> = T[number]['name']

export interface TypedHardforkSchema<
  Entries extends readonly HardforkSchemaEntry<string>[],
> {
  readonly hardforks: Entries
  readonly chainId: bigint
  readonly chain?: ChainConfig
}

export interface TypedGlobalConfigOpts<
  Entries extends readonly HardforkSchemaEntry<string>[],
> {
  schema: TypedHardforkSchema<Entries>
  hardfork?: ExtractHardforkNames<Entries>
  customCrypto?: CustomCrypto
  overrides?: ParamsConfig
}

export type HardforkParamManager<
  H extends string = string,
  _SchemaH extends string = string,
> = ParamsManager<H extends Hardfork ? H : Hardfork>

export interface GlobalConfigInit<H extends string, SchemaH extends string> {
  chainId: bigint
  customCrypto?: CustomCrypto
  hardfork: H
  hardforkParams: HardforkParamManager<H, SchemaH>
  schemaHardforks: readonly HardforkSchemaEntry<string>[]
  chain?: ChainConfig
}
