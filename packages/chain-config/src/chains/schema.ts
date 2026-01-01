import {
  type HardforkSchemaEntry,
  ParamsManager,
  type ParamsManagerOptions,
  type TypedHardforkSchema,
} from '../config'
import type { Hardfork } from '../hardforks'
import type { ChainConfig } from '../types'

export function createParamsManager<H extends Hardfork>(
  hardfork: H,
  options?: ParamsManagerOptions,
): ParamsManager<H> {
  return new ParamsManager(hardfork, options)
}

export function createHardforkSchema<
  const Entries extends readonly HardforkSchemaEntry<string>[],
>(config: {
  hardforks: Entries
  chainId: bigint
  chain?: ChainConfig
}): TypedHardforkSchema<Entries> {
  return config
}

export function hardforkEntry<Name extends string>(
  name: Name,
  config: Omit<HardforkSchemaEntry<Name>, 'name'>,
): HardforkSchemaEntry<Name> {
  return { name, ...config }
}
