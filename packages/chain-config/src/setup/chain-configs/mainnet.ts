import { Hardfork } from '../../fork-params/enums'
import {
  createHardforkSchema,
  HardforkParamManager,
  hardforkEntry,
} from '../../global/param-manager'
import type { ChainConfig, ParamsConfig } from '../../types'

export const customChainConfig: ChainConfig = {
  name: 'testnet',
  chainId: 12345n,
  defaultHardfork: 'tangerineWhistle',
  consensus: {
    type: 'pow',
    algorithm: 'ethash',
  },
  genesis: {
    gasLimit: 10485760,
    difficulty: 1,
    nonce: '0xbb00000000000000',
    extraData:
      '0xcc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
  hardforks: [
    { name: 'chainstart', block: 0n },
    { name: 'homestead', block: 0n },
    { name: 'dao', block: 0n },
    { name: 'tangerineWhistle', block: 0n },
  ],
  bootstrapNodes: [],
}
/**
 * Mainnet hardfork schema starting at Prague.
 * Includes all mainnet hardforks from genesis through Prague.
 *
 * Block numbers and timestamps are from Ethereum mainnet:
 * - Block-based forks: chainstart through London
 * - Timestamp-based forks: Paris through Prague
 */
export const mainnetSchema = createHardforkSchema({
  hardforks: [
    // Genesis
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),

    // Block-based forks
    hardforkEntry(Hardfork.Homestead, { block: 1150000n }),
    hardforkEntry(Hardfork.Dao, { block: 1920000n, optional: true }),
    hardforkEntry(Hardfork.TangerineWhistle, { block: 2463000n }),
    hardforkEntry(Hardfork.SpuriousDragon, { block: 2675000n }),
    hardforkEntry(Hardfork.Byzantium, { block: 4370000n }),
    hardforkEntry(Hardfork.Constantinople, { block: 7280000n }),
    hardforkEntry(Hardfork.Petersburg, { block: 7280000n }),
    hardforkEntry(Hardfork.Istanbul, { block: 9069000n }),
    hardforkEntry(Hardfork.MuirGlacier, { block: 9200000n, optional: true }),
    hardforkEntry(Hardfork.Berlin, { block: 12244000n }),
    hardforkEntry(Hardfork.London, { block: 12965000n }),
    hardforkEntry(Hardfork.ArrowGlacier, { block: 13773000n, optional: true }),
    hardforkEntry(Hardfork.GrayGlacier, { block: 15050000n, optional: true }),

    // Timestamp-based forks (post-merge)
    hardforkEntry(Hardfork.Paris, { block: null, timestamp: '1681338455' }),
    hardforkEntry(Hardfork.Shanghai, { block: null, timestamp: '1681338455' }),
    hardforkEntry(Hardfork.Cancun, { block: null, timestamp: '1710338135' }),
    hardforkEntry(Hardfork.Prague, { block: null, timestamp: '1746612311' }),
    hardforkEntry(Hardfork.Osaka, { block: null, timestamp: '1764798551' }),
    hardforkEntry(Hardfork.Bpo1, { block: null, timestamp: '1765290071' }),
    hardforkEntry(Hardfork.Bpo2, { block: null, timestamp: '1767747671' }),
  ] as const,
  chainId: 12345n,
  chain: customChainConfig,
  validationOpts: {
    customOptionalForks: [
      Hardfork.Dao,
      Hardfork.MuirGlacier,
      Hardfork.ArrowGlacier,
      Hardfork.GrayGlacier,
    ],
  },
})

/**
 * Type representing the hardforks available in the mainnet schema
 */
export type MainnetHardfork = (typeof mainnetSchema.hardforks)[number]['name']

/**
 * Create a HardforkParamManager for mainnet starting at Prague.
 * This is the recommended entry point for mainnet configuration.
 *
 * @param overrides - Optional parameter overrides
 * @returns A type-safe HardforkParamManager for mainnet
 *
 * @example
 * ```ts
 * const manager = createMainnetManager()
 * const rules = manager.rules(blockNumber, timestamp)
 *
 * // Type-safe access to mainnet hardforks
 * manager.withHardfork('prague')  // ✅ OK
 * manager.withHardfork('osaka')   // ❌ Error: not on mainnet yet
 * ```
 */
export function createMainnetManager(overrides?: ParamsConfig) {
  return HardforkParamManager.createFromSchema(
    Hardfork.Prague,
    mainnetSchema,
    overrides,
  )
}

/**
 * Pre-configured mainnet manager at Prague
 */
export const mainnetManager = createMainnetManager()
