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
  const defaultHardfork = config.spec.chain?.defaultHardfork

  // Get the index of the default hardfork (minimum floor)
  const defaultHfIndex = defaultHardfork
    ? hardforks.findIndex((hf) => hf.name === defaultHardfork)
    : -1

  let blockResultIndex = -1
  let timestampResultIndex = -1

  // Find latest hardfork by block number (for pre-merge forks)
  if (blockNumber !== undefined) {
    for (let i = hardforks.length - 1; i >= 0; i--) {
      const hf = hardforks[i]
      if (hf.block !== null && blockNumber >= hf.block) {
        blockResultIndex = i
        break
      }
    }
  }

  // Find latest hardfork by timestamp (for post-merge forks: Shanghai, Cancun, Prague)
  // IMPORTANT: Check independently - NOT as else-if!
  if (timestamp !== undefined) {
    for (let i = hardforks.length - 1; i >= 0; i--) {
      const hf = hardforks[i]
      if (hf.timestamp !== undefined && timestamp >= BigInt(hf.timestamp)) {
        timestampResultIndex = i
        break
      }
    }
  }

  // Return the LATER hardfork (higher index = more recent)
  let resultIndex = Math.max(blockResultIndex, timestampResultIndex)

  // Apply defaultHardfork as minimum floor
  // For chains that specify a defaultHardfork, never return an earlier hardfork
  if (defaultHfIndex >= 0 && resultIndex < defaultHfIndex) {
    resultIndex = defaultHfIndex
  }

  if (resultIndex >= 0) {
    return hardforks[resultIndex].name
  }

  // Fallback to defaultHardfork or last hardfork
  return defaultHardfork ?? hardforks[hardforks.length - 1].name
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

