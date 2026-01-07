import { deepFreeze, EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import {
  HARDFORK_EIPS,
  HARDFORK_ORDER,
  type Hardfork,
} from '../../hardforks/hardforks'
import type {
  AllParamNames,
  HardforkParamsMap,
  ParamsAtHardfork,
} from '../../hardforks/params'
import {
  getActiveEips,
  getHardforkForEIP,
  isEIPActiveAtHardfork,
} from './eip-getters'
import {
  getHardforkByBlock,
  hardforkBlock,
  hardforkTimestamp,
  isHardforkAfter,
} from './hardfork-getters'
import { getParamAtHardfork, getParamsAtHardfork } from './param-getters'
import type { ChainSpec, FrozenChainConfig, HardforkManager } from './types'

export function createHardforkManager(spec: ChainSpec): HardforkManager {
  const config = _validateAndSetChainSchema(spec)

  // Get the latest hardfork from the spec (most permissive, like geth's LatestSigner)
  // For post-merge hardforks that use timestamp, we need to use a very large timestamp
  // to ensure we get the latest hardfork that's actually active
  const getLatestHardfork = (): string => {
    const latestHf = spec.hardforks[spec.hardforks.length - 1]
    if (!latestHf) return 'chainstart'

    // If the latest hardfork uses timestamp-based activation, we need to check
    // with a very large timestamp to get the actual latest active hardfork
    if (latestHf.block === null && latestHf.timestamp !== undefined) {
      // Use MAX_UINT64 as timestamp to ensure we get the latest hardfork
      const maxTimestamp = BigInt('18446744073709551615') // 2^64 - 1
      return getHardforkByBlock(config, undefined, maxTimestamp)
    }

    // For block-based hardforks, just return the name
    return latestHf.name
  }

  return Object.freeze({
    config,

    chainId: () => config.spec.chainId,
    chainName: () => config.spec.chain?.name ?? '',
    hardforks: () => config.spec.hardforks,
    genesis: () => config.spec.chain?.genesis,

    getLatestHardfork,

    getHardforkByBlock: (blockNumber?: bigint, timestamp?: bigint) => {
      if (blockNumber !== undefined || timestamp !== undefined) {
        return getHardforkByBlock(config, blockNumber, timestamp)
      }
      return getLatestHardfork()
    },

    getHardforkFromContext: (
      context?: string | { blockNumber: bigint; timestamp?: bigint },
    ) => {
      if (context === undefined) {
        // No context provided - use latest hardfork (most permissive)
        return getLatestHardfork()
      } else if (typeof context === 'string') {
        // Hardfork identifier provided
        return context
      } else {
        // Block context provided - determine hardfork from block
        return getHardforkByBlock(
          config,
          context.blockNumber,
          context.timestamp,
        )
      }
    },

    isEIPActiveAtHardfork: (eip: number, hardfork: string) =>
      isEIPActiveAtHardfork(config, eip, hardfork),

    getParamAtHardfork: <P extends AllParamNames>(
      param: P,
      context?: string | { blockNumber: bigint; timestamp?: bigint },
    ) => {
      let hardfork: string
      if (context === undefined) {
        // No context provided - use latest hardfork (most permissive)
        hardfork = getLatestHardfork()
      } else if (typeof context === 'string') {
        // Hardfork identifier provided
        hardfork = context
      } else {
        // Block context provided - determine hardfork from block
        hardfork = getHardforkByBlock(
          config,
          context.blockNumber,
          context.timestamp,
        )
      }
      return getParamAtHardfork(config, param, hardfork)
    },

    getParamsAtHardfork: <H extends keyof HardforkParamsMap>(hardfork: H) =>
      getParamsAtHardfork(config, hardfork) as ParamsAtHardfork<H>,

    hardforkGte: (hardfork: string, target: string) =>
      isHardforkAfter(config, hardfork, target),

    hardforkBlock: (hardfork: string) => hardforkBlock(config, hardfork),

    hardforkTimestamp: (hardfork: string) =>
      hardforkTimestamp(config, hardfork),

    getActiveEips: (hardfork: string) => getActiveEips(config, hardfork),

    isEIPActiveAtBlock: (
      eip: number,
      blockNum?: { blockNumber: bigint; timestamp?: bigint },
    ) => {
      const hardfork = blockNum
        ? getHardforkByBlock(config, blockNum.blockNumber, blockNum.timestamp)
        : getLatestHardfork()
      return hardfork ? isEIPActiveAtHardfork(config, eip, hardfork) : false
    },

    getHardforkForEIP: (eip: number) => getHardforkForEIP(config, eip),
  })
}

function _validateAndSetChainSchema(spec: ChainSpec): FrozenChainConfig {
  const hardforkIndex = new Map<string, number>()
  const eipToHardfork = new Map<number, string>()
  const cumulativeEips = new Map<string, Set<number>>()

  let cumulative = new Set<number>()

  if (!spec.hardforks || spec.hardforks.length === 0) {
    throw EthereumJSErrorWithoutCode(
      'Chain spec must have at least one hardfork',
    )
  }

  const first = spec.hardforks[0]
  if (first.block !== 0n && first.block !== null) {
    throw EthereumJSErrorWithoutCode(
      `First hardfork "${first.name}" must have block 0 or null, got ${first.block}`,
    )
  }

  const hardforkNames = spec.hardforks.map((h) => h.name)
  for (let i = 0; i < hardforkNames.length; i++) {
    const orderIndex = HARDFORK_ORDER.indexOf(hardforkNames[i] as Hardfork)
    if (orderIndex === -1) continue

    for (let j = 0; j < i; j++) {
      const prevName = hardforkNames[j]
      const prevOrderIndex = HARDFORK_ORDER.indexOf(prevName as Hardfork)

      if (prevOrderIndex !== -1 && prevOrderIndex > orderIndex) {
        throw EthereumJSErrorWithoutCode(
          `Hardfork "${name}" must come after "${prevName}" in the hardfork order`,
        )
      }
    }
  }

  if (spec.chainId <= 0n) {
    throw EthereumJSErrorWithoutCode('Chain ID must be positive')
  }

  for (let i = 0; i < spec.hardforks.length; i++) {
    const hf = spec.hardforks[i]
    const hfName = hf.name as Hardfork

    hardforkIndex.set(hf.name, i)
    const eips = HARDFORK_EIPS[hfName] ?? []

    for (const eip of eips) {
      if (!eipToHardfork.has(eip)) {
        eipToHardfork.set(eip, hf.name)
      }
    }

    cumulative = new Set([...cumulative, ...eips])
    cumulativeEips.set(hf.name, new Set(cumulative))
  }

  return deepFreeze({
    spec,
    _hardforkIndex: hardforkIndex,
    _eipToHardfork: eipToHardfork,
    _cumulativeEips: cumulativeEips,
  })
}
