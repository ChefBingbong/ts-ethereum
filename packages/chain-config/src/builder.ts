import type { GethGenesis } from './defaults/gethGenesis.js'
import { GlobalConfig, parseGethGenesis } from './index'
import type { BaseOpts, ChainConfig, GethConfigOpts } from './index.js'

export function createCustomCommon(
  partialConfig: Partial<ChainConfig>,
  baseChain: ChainConfig,
  opts: BaseOpts = {},
): GlobalConfig {
  return new GlobalConfig({
    chain: {
      ...baseChain,
      ...partialConfig,
    },
    ...opts,
  })
}

export function createCommonFromGethGenesis(
  genesisJSON: GethGenesis,
  { chain, eips, genesisHash, hardfork, params, customCrypto }: GethConfigOpts,
): GlobalConfig {
  const genesisParams = parseGethGenesis(genesisJSON, chain)
  const common = new GlobalConfig({
    chain: {
      ...genesisParams,
      name: genesisParams.name ?? 'Custom chain',
    } as ChainConfig, // Typecasting because of `string` -> `PrefixedHexString` mismatches
    eips,
    params,
    hardfork: hardfork ?? genesisParams.hardfork,
    customCrypto,
  })
  if (genesisHash !== undefined) {
    common.setForkHashes(genesisHash)
  }
  return common
}
