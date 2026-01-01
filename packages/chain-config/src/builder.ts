import { parseGethGenesis } from './genesis/gethGenesis'
import type { GethGenesis } from './genesis/types'
import { Hardfork } from './hardforks/hardforks.js'
import { createHardforkSchema, GlobalConfig, hardforkEntry } from './index'
import type { BaseOpts, ChainConfig, GethConfigOpts } from './index.js'

export function schemaFromChainConfig(chainConfig: ChainConfig) {
  return createHardforkSchema({
    hardforks: chainConfig.hardforks.map((hf) =>
      hardforkEntry(hf.name, {
        block: hf.block,
        timestamp: hf.timestamp,
        forkHash: hf.forkHash,
        optional: hf.optional,
      }),
    ),
    chainId: BigInt(chainConfig.chainId),
    chain: chainConfig,
  })
}

export function createCustomCommon(
  partialConfig: Partial<ChainConfig>,
  baseChain: ChainConfig,
  opts: BaseOpts = {},
) {
  const mergedChain = {
    ...baseChain,
    ...partialConfig,
  }
  const forkId = opts.hardfork ?? Hardfork.Chainstart
  const schema = schemaFromChainConfig(mergedChain)
  const hardfork = forkId

  const config = GlobalConfig.fromSchema({
    schema,
    hardfork,
  })

  if (opts.params) {
    config.updateBatchParams(opts.params)
  }

  return config
}

export function createCommonFromGethGenesis(
  genesisJSON: GethGenesis,
  { chain, genesisHash, hardfork, params, customCrypto }: GethConfigOpts,
) {
  const genesisParams = parseGethGenesis(genesisJSON, chain)
  const chainConfig = {
    ...genesisParams,
  }

  const schema = schemaFromChainConfig(chainConfig as any)
  const initialHardfork = hardfork ?? genesisParams.hardfork

  const common = GlobalConfig.fromSchema({
    schema,
    hardfork: initialHardfork,
    customCrypto,
  })

  if (params) {
    common.updateBatchParams(params)
  }

  if (genesisHash !== undefined) {
    common.setForkHashes(genesisHash)
  }

  return common as GlobalConfig<any, any>
}
