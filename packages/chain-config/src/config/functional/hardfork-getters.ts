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
  blockNumber: bigint,
  timestamp?: bigint,
) {
  const { hardforks } = config.spec
  let result = hardforks[0].name

  for (const hf of hardforks) {
    if (hf.block !== null && blockNumber >= hf.block) {
      if (hf.timestamp !== undefined && timestamp !== undefined) {
        const hfTimestamp = BigInt(hf.timestamp)
        if (timestamp >= hfTimestamp) {
          result = hf.name
        }
      } else if (hf.timestamp === undefined) {
        result = hf.name
      }
    } else if (
      hf.block === null &&
      hf.timestamp !== undefined &&
      timestamp !== undefined
    ) {
      const hfTimestamp = BigInt(hf.timestamp)
      if (timestamp >= hfTimestamp) {
        result = hf.name
      }
    }
  }

  return result
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
