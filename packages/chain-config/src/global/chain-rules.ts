import { HARDFORK_ORDER, Hardfork } from '../fork-params/enums'
import { OPTIONAL_HARDFORKS } from '../types'
import type {
  ExtractHardforkNames,
  HardforkSchemaEntry,
  SchemaChainRules,
} from './param-manager'

/**
 * Error thrown when chain configuration validation fails.
 */
export class ChainConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChainConfigError'
  }
}

/**
 * Options for fork order validation
 */
export interface ValidateForkOrderOpts {
  /** Additional hardforks to treat as optional beyond the defaults */
  customOptionalForks?: Hardfork[]
  /** Custom hardfork names that are not in HARDFORK_ORDER (ignored during standard validation) */
  customHardforks?: string[]
}

/**
 * Validates fork ordering (mirrors geth's CheckConfigForkOrder).
 *
 * Rules:
 * 1. Required forks must be present if any later fork is defined
 * 2. Block-based forks cannot come after timestamp-based forks
 * 3. Forks must be in chronological order within their type
 * 4. Optional forks (DAO, bomb delays) can be omitted freely
 * 5. Custom hardforks (not in HARDFORK_ORDER) are allowed and skipped
 *
 * @param hardforks - Array of hardfork transition configs to validate
 * @param opts - Optional configuration for validation
 * @throws {ChainConfigError} If validation fails
 *
 * @example
 * ```ts
 * // Simple validation
 * validateForkOrder(chain.hardforks)
 *
 * // With custom optional forks
 * validateForkOrder(chain.hardforks, {
 *   customOptionalForks: [Hardfork.Paris],
 * })
 *
 * // With custom hardforks that aren't in standard order
 * validateForkOrder(chain.hardforks, {
 *   customHardforks: ['myCustomFork'],
 * })
 * ```
 */
export function validateForkOrder(
  hardforks: readonly HardforkSchemaEntry<string>[],
  opts?: ValidateForkOrderOpts,
): void {
  const hardforkMap = new Map(hardforks.map((hf) => [hf.name, hf]))
  const customOptional = new Set(opts?.customOptionalForks ?? [])
  const customHardforks = new Set(opts?.customHardforks ?? [])

  let lastBlockFork: { name: string; block: number } | null = null
  let lastTimeFork: { name: string; timestamp: bigint } | null = null
  let hasTimestampFork = false

  // Check if fork is optional (globally, per-config, or custom)
  const isOptional = (hfName: Hardfork): boolean => {
    if (OPTIONAL_HARDFORKS.has(hfName)) return true
    if (customOptional.has(hfName)) return true
    const config = hardforkMap.get(hfName)
    return config?.optional === true
  }

  for (const hfName of HARDFORK_ORDER) {
    const hf = hardforkMap.get(hfName)
    if (!hf) continue

    // Fork not in config - check if it's required
    if (!hf) {
      if (!isOptional(hfName)) {
        console.log('hfName', hfName, isOptional(hfName))
        // Check if any later fork IS defined
        const hfIndex = HARDFORK_ORDER.indexOf(hfName)
        const laterForks = HARDFORK_ORDER.slice(hfIndex + 1)

        for (const later of laterForks) {
          if (hardforkMap.has(later)) {
            throw new ChainConfigError(
              `Unsupported fork ordering: "${hfName}" not enabled, but "${later}" is enabled`,
            )
          }
        }
      }
      continue
    }

    // Validate ordering based on fork type
    if (hf.block !== null) {
      if (hasTimestampFork) {
        throw new ChainConfigError(
          `Unsupported fork ordering: "${hf.name}" uses block ordering, but timestamp-based forks already defined`,
        )
      }

      if (lastBlockFork && hf.block < lastBlockFork.block) {
        throw new ChainConfigError(
          `Unsupported fork ordering: "${hf.name}" enabled at block ${hf.block}, but "${lastBlockFork.name}" enabled at block ${lastBlockFork.block}`,
        )
      }

      lastBlockFork = { name: hf.name, block: Number(hf.block) }
    } else if (hf.timestamp !== undefined) {
      hasTimestampFork = true
      const ts = BigInt(hf.timestamp)

      if (lastTimeFork && ts < lastTimeFork.timestamp) {
        throw new ChainConfigError(
          `Unsupported fork ordering: "${hf.name}" enabled at timestamp ${ts}, but "${lastTimeFork.name}" enabled at timestamp ${lastTimeFork.timestamp}`,
        )
      }

      lastTimeFork = { name: hf.name, timestamp: ts }
    }
  }

  // Validate custom hardforks ordering (just chronological, no required check)
  for (const hf of hardforks) {
    if (customHardforks.has(hf.name)) {
      // Custom forks just need to be in order relative to each other
      if (hf.block !== null) {
        if (hasTimestampFork) {
          throw new ChainConfigError(
            `Custom fork "${hf.name}" uses block ordering, but timestamp-based forks already defined`,
          )
        }
        if (lastBlockFork && hf.block < lastBlockFork.block) {
          throw new ChainConfigError(
            `Custom fork "${hf.name}" at block ${hf.block} before "${lastBlockFork.name}" at ${lastBlockFork.block}`,
          )
        }
        lastBlockFork = { name: hf.name, block: Number(hf.block) }
      } else if (hf.timestamp !== undefined) {
        const ts = BigInt(hf.timestamp)
        if (lastTimeFork && ts < lastTimeFork.timestamp) {
          throw new ChainConfigError(
            `Custom fork "${hf.name}" at timestamp ${ts} before "${lastTimeFork.name}" at ${lastTimeFork.timestamp}`,
          )
        }
        lastTimeFork = { name: hf.name, timestamp: ts }
      }
    }
  }
}

/**
 * Build ChainRules for a specific block/timestamp.
 * Pre-computes all fork activation flags for fast runtime checks.
 *
 * @param hardforks - Array of hardfork transition configs
 * @param chainId - Chain ID for the rules
 * @param blockNumber - Current block number
 * @param timestamp - Current block timestamp
 * @returns ChainRules with all fork activation flags
 *
 * @example
 * ```ts
 * const rules = buildChainRules(chain.hardforks, 1n, blockNumber, timestamp)
 * if (rules.isLondon) {
 *   // Use EIP-1559
 * }
 * ```
 */
export function buildChainRules(
  hardforks: readonly HardforkSchemaEntry<string>[],
  chainId: bigint,
  blockNumber: bigint,
  timestamp: bigint,
): SchemaChainRules<ExtractHardforkNames<typeof hardforks>> {
  const hardforkMap = new Map(hardforks.map((hf) => [hf.name, hf]))

  const isActive = (hf: Hardfork): boolean => {
    const config = hardforkMap.get(hf)
    if (!config) return false

    if (config.block !== null) {
      return blockNumber >= BigInt(config.block)
    }
    if (config.timestamp !== undefined) {
      return timestamp >= BigInt(config.timestamp)
    }
    return false
  }

  return {
    chainId,

    // Block-based forks
    isHomestead: isActive(Hardfork.Homestead),
    isDAO: isActive(Hardfork.Dao),
    isTangerineWhistle: isActive(Hardfork.TangerineWhistle),
    isSpuriousDragon: isActive(Hardfork.SpuriousDragon),
    isByzantium: isActive(Hardfork.Byzantium),
    isConstantinople: isActive(Hardfork.Constantinople),
    isPetersburg: isActive(Hardfork.Petersburg),
    isIstanbul: isActive(Hardfork.Istanbul),
    isBerlin: isActive(Hardfork.Berlin),
    isLondon: isActive(Hardfork.London),

    // Timestamp-based forks
    isParis: isActive(Hardfork.Paris),
    isShanghai: isActive(Hardfork.Shanghai),
    isCancun: isActive(Hardfork.Cancun),
    isPrague: isActive(Hardfork.Prague),
    isOsaka: isActive(Hardfork.Osaka),

    // EIP-specific flags
    isEIP1559: isActive(Hardfork.London),
    isEIP2929: isActive(Hardfork.Berlin),
    isEIP4844: isActive(Hardfork.Cancun),
    isEIP7702: isActive(Hardfork.Prague),
  }
}
