import type { FrozenChainConfig } from './types'

export function isEIPActiveAtHardfork(
  config: FrozenChainConfig,
  eip: number,
  hardfork: string,
) {
  const cumulative = config._cumulativeEips.get(hardfork)
  return cumulative?.has(eip) ?? false
}

export function getActiveEips(config: FrozenChainConfig, hardfork: string) {
  const cumulative = config._cumulativeEips.get(hardfork)
  return cumulative ? [...cumulative] : []
}

export function getHardforkForEIP(config: FrozenChainConfig, eip: number) {
  return config._eipToHardfork.get(eip)
}
