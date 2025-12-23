import type { BaseOpts, ChainConfig } from '.'
import { Common } from '.'

export function createCustomCommon(
  partialConfig: Partial<ChainConfig>,
  baseChain: ChainConfig,
  opts: BaseOpts = {} as any,
): Common {
  return new Common({
    chain: {
      ...baseChain,
      ...partialConfig,
    },
    ...opts,
  })
}
