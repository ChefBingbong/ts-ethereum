import { HardforkParamManager } from '../../config/param-manager'
import { Hardfork } from '../../hardforks'
import type { ParamsConfig } from '../../types'
import { createHardforkSchema, hardforkEntry } from '../schema'

export const testnetSchema = createHardforkSchema({
  hardforks: [
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),

    hardforkEntry(Hardfork.Homestead, { block: 0n }),
    hardforkEntry(Hardfork.Dao, { block: 0n, optional: true }),
    hardforkEntry(Hardfork.TangerineWhistle, { block: 0n }),
    hardforkEntry(Hardfork.SpuriousDragon, { block: 0n }),
    hardforkEntry(Hardfork.Byzantium, { block: 0n }),
    hardforkEntry(Hardfork.Constantinople, { block: 0n }),
    hardforkEntry(Hardfork.Petersburg, { block: 0n }),
    hardforkEntry(Hardfork.Istanbul, { block: 0n }),
    hardforkEntry(Hardfork.MuirGlacier, { block: 0n, optional: true }),
    hardforkEntry(Hardfork.Berlin, { block: 0n }),
    hardforkEntry(Hardfork.London, { block: 0n }),
    hardforkEntry(Hardfork.ArrowGlacier, { block: 0n, optional: true }),
    hardforkEntry(Hardfork.GrayGlacier, { block: 0n, optional: true }),
    hardforkEntry(Hardfork.MergeNetsplitBlock, { block: 0n, optional: true }),

    hardforkEntry(Hardfork.Paris, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Shanghai, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Cancun, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Prague, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Osaka, { block: null, timestamp: '0' }),

    hardforkEntry(Hardfork.Bpo1, {
      block: null,
      timestamp: '0',
      optional: true,
    }),
    hardforkEntry(Hardfork.Bpo2, {
      block: null,
      timestamp: '0',
      optional: true,
    }),
    hardforkEntry(Hardfork.Bpo3, {
      block: null,
      timestamp: '0',
      optional: true,
    }),
    hardforkEntry(Hardfork.Bpo4, {
      block: null,
      timestamp: '0',
      optional: true,
    }),
    hardforkEntry(Hardfork.Bpo5, {
      block: null,
      timestamp: '0',
      optional: true,
    }),
  ] as const,
  chainId: 12345n,
})

export type TestnetHardfork = (typeof testnetSchema.hardforks)[number]['name']

export function createTestnetManager<H extends TestnetHardfork = 'osaka'>(
  hardfork?: H,
  overrides?: ParamsConfig,
) {
  return HardforkParamManager.createFromSchema(
    hardfork ?? (Hardfork.Osaka as H),
    testnetSchema,
    overrides,
  )
}

export const testnetManager = createTestnetManager()
