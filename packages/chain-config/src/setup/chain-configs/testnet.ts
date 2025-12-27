import { Hardfork } from '../../fork-params/enums'
import {
  createHardforkSchema,
  hardforkEntry,
  HardforkParamManager,
} from '../../global/param-manager'
import type { ParamsConfig } from '../../types'

/**
 * Test network hardfork schema with ALL hardforks available.
 * Useful for testing and development where you need access to all features.
 *
 * All block-based forks activate at block 0.
 * All timestamp-based forks activate at timestamp 0.
 * Chain ID: 12345
 */
export const testnetSchema = createHardforkSchema({
  hardforks: [
    // Genesis
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),

    // Block-based forks (all at genesis)
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

    // Timestamp-based forks (all at timestamp 0)
    hardforkEntry(Hardfork.Paris, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Shanghai, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Cancun, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Prague, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Osaka, { block: null, timestamp: '0' }),

    // BPO (Blob Parameter Optimization) forks
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
  validationOpts: {
    customOptionalForks: [
      Hardfork.Dao,
      Hardfork.MuirGlacier,
      Hardfork.ArrowGlacier,
      Hardfork.GrayGlacier,
      Hardfork.MergeNetsplitBlock,
      Hardfork.Bpo1,
      Hardfork.Bpo2,
      Hardfork.Bpo3,
      Hardfork.Bpo4,
      Hardfork.Bpo5,
    ],
  },
})

/**
 * Type representing ALL hardforks available in the testnet schema
 */
export type TestnetHardfork = (typeof testnetSchema.hardforks)[number]['name']

/**
 * Create a HardforkParamManager for testnet with all forks enabled.
 * Defaults to Osaka (latest) but can start at any hardfork.
 *
 * @param hardfork - Starting hardfork (defaults to Osaka)
 * @param overrides - Optional parameter overrides
 * @returns A type-safe HardforkParamManager for testnet
 *
 * @example
 * ```ts
 * const manager = createTestnetManager()
 * const rules = manager.rules(blockNumber, timestamp)
 *
 * // All hardforks are available
 * manager.withHardfork('chainstart')  // ✅ OK
 * manager.withHardfork('osaka')       // ✅ OK
 * manager.withHardfork('bpo5')        // ✅ OK
 * ```
 */
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

/**
 * Pre-configured testnet manager at Osaka (latest)
 */
export const testnetManager = createTestnetManager()
