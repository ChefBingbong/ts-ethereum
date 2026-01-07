import { HARDFORK_ORDER, type Hardfork } from '../../hardforks/hardforks'
import type { FrozenChainConfig } from './types'

export function hardforkBlock(config: FrozenChainConfig, hardfork: string) {
  const entry = config.spec.hardforks.find((h) => h.name === hardfork)
  return entry?.block ?? null
}

export function hardforkTimestamp(config: FrozenChainConfig, hardfork: string) {
  const entry = config.spec.hardforks.find((h) => h.name === hardfork)
  if (entry?.timestamp === undefined) return undefined
  return BigInt(entry.timestamp)
}

export function getHardforkByBlock(
  config: FrozenChainConfig,
  blockNumber?: bigint,
  timestamp?: bigint,
) {
  const { hardforks } = config.spec
  let result: string | undefined

  if (blockNumber !== undefined) {
    // Find the LAST hardfork where blockNumber >= hf.block (most recent applicable hardfork)
    // We need to iterate backwards to find the most recent one
    for (let i = hardforks.length - 1; i >= 0; i--) {
      const hf = hardforks[i]
      if (hf.block !== null && blockNumber >= hf.block) {
        result = hf.name
        break
      }
    }
  } else if (timestamp !== undefined) {
    // Find the LAST hardfork where timestamp >= hf.timestamp (most recent applicable hardfork)
    for (let i = hardforks.length - 1; i >= 0; i--) {
      const hf = hardforks[i]
      if (hf.timestamp !== undefined && timestamp >= BigInt(hf.timestamp)) {
        result = hf.name
        break
      }
    }
  }

  return result ?? hardforks[hardforks.length - 1].name
}

export function isHardforkAfter(
  config: FrozenChainConfig,
  hardfork: string,
  target: string,
) {
  const hfIdx = config._hardforkIndex.get(hardfork)
  const targetIdx = config._hardforkIndex.get(target)

  if (hfIdx === undefined || targetIdx === undefined) {
    const orderHfIdx = HARDFORK_ORDER.indexOf(hardfork as Hardfork)
    const orderTargetIdx = HARDFORK_ORDER.indexOf(target as Hardfork)

    if (orderHfIdx === -1 || orderTargetIdx === -1) {
      return false
    }
    return orderHfIdx >= orderTargetIdx
  }

  return hfIdx >= targetIdx
}
