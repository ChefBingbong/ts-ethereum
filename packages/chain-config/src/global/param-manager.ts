import type { EIP, Hardfork } from '../fork-params/enums'
import type { ChainConfig, ChainParams, ParamsConfig } from '../types'
import {
  buildChainRules,
  validateForkOrder,
  type ValidateForkOrderOpts,
} from './chain-rules'
import {
  getCumulativeEIPs,
  getEIPParam,
  getRawParam,
  isEIPActiveAtHardfork,
} from './getters'
import type {
  EIPParamKeys,
  EIPParamType,
  EIPWithHardfork,
  EIPWithParams,
  MinHardforkFor,
} from './types'

export class EIPAccessor<E extends EIPWithParams> {
  constructor(private readonly eip: E) {}

  get<K extends EIPParamKeys<E>>(param: K): EIPParamType<E, K> {
    return getEIPParam(this.eip, param)
  }
}

// ============================================================================
// Type-Safe Hardfork Schema Types
// ============================================================================

/**
 * A single hardfork entry in the schema.
 * The name must be a valid hardfork (standard or custom).
 *
 * @typeParam Name - The hardfork name literal type
 */
export interface HardforkSchemaEntry<Name extends string = string> {
  /** The hardfork name - must match your hardfork type */
  readonly name: Name
  /** Block number for activation (null = timestamp-based fork) */
  readonly block: bigint | null
  /** Timestamp for activation (undefined = block-based fork) */
  readonly timestamp?: number | string
  /** Fork hash for network identification */
  readonly forkHash?: string | null
  /**
   * Whether this fork is optional for this chain.
   * Optional forks can be omitted without breaking fork ordering validation.
   */
  readonly optional?: boolean
}

/**
 * Create a type-safe hardfork schema entry.
 * This helper ensures the name is properly typed.
 *
 * @example
 * ```ts
 * const entry = hardforkEntry('london', { block: 100 })
 * // Type: HardforkSchemaEntry<'london'>
 * ```
 */
export function hardforkEntry<Name extends string>(
  name: Name,
  config: Omit<HardforkSchemaEntry<Name>, 'name'>,
): HardforkSchemaEntry<Name> {
  return { name, ...config }
}

/**
 * Extract hardfork names from a readonly tuple of schema entries.
 * This is the key type that derives available forks from the schema.
 */
export type ExtractHardforkNames<
  T extends readonly HardforkSchemaEntry<string>[],
> = T[number]['name']

/**
 * A typed hardfork schema that preserves the exact hardfork names.
 *
 * @typeParam Entries - Tuple of HardforkSchemaEntry types with literal names
 */
export interface TypedHardforkSchema<
  Entries extends readonly HardforkSchemaEntry<string>[],
> {
  /** Array of hardfork transition configs with preserved types */
  readonly hardforks: Entries
  /** Chain ID */
  readonly chainId: bigint
  /** Chain config (optional - for full chain configuration) */
  readonly chain?: ChainConfig
  /** Options for fork order validation */
  readonly validationOpts?: ValidateForkOrderOpts
}

/**
 * Create a type-safe hardfork schema.
 * The hardfork names are preserved as literal types for type inference.
 *
 * @example
 * ```ts
 * const schema = createHardforkSchema({
 *   hardforks: [
 *     hardforkEntry('chainstart', { block: 0n, optional: true }),
 *     hardforkEntry('london', { block: 100, optional: true }),
 *     hardforkEntry('myCustomFork', { block: null, timestamp: '2000' }),
 *   ] as const,
 *   chainId: 1337n,
 * })
 * // Type inference knows exactly which forks are available
 * ```
 */
export function createHardforkSchema<
  const Entries extends readonly HardforkSchemaEntry<string>[],
>(config: {
  hardforks: Entries
  chainId: bigint
  chain?: ChainConfig
  validationOpts?: ValidateForkOrderOpts
}): TypedHardforkSchema<Entries> {
  return config
}

/**
 * Legacy schema interface for backward compatibility.
 * Use TypedHardforkSchema for better type inference.
 */
export interface HardforkSchema {
  /** Array of hardfork transition configs defining when each fork activates */
  hardforks: readonly HardforkSchemaEntry<string>[]
  /** Chain ID */
  chainId: bigint
  /** Options for fork order validation */
  validationOpts?: ValidateForkOrderOpts
}

/**
 * Options for creating a HardforkParamManager with a typed schema
 */
export interface TypedHardforkParamManagerOpts<
  Entries extends readonly HardforkSchemaEntry<string>[],
> {
  /** Typed hardfork schema for validation - preserves hardfork name types */
  schema: TypedHardforkSchema<Entries>
  /** Parameter overrides */
  overrides?: ParamsConfig
}

/**
 * Options for creating a HardforkParamManager (legacy untyped)
 */
export interface HardforkParamManagerOpts {
  /** Hardfork schema for validation - if provided, validates on construction */
  schema?: HardforkSchema
  /** Parameter overrides */
  overrides?: ParamsConfig
}

// ============================================================================
// ChainRules Type Generation from Schema
// ============================================================================

/**
 * Standard hardfork names that have corresponding isXxx flags in ChainRules
 */
type StandardHardforkFlags =
  | 'homestead'
  | 'dao'
  | 'tangerineWhistle'
  | 'spuriousDragon'
  | 'byzantium'
  | 'constantinople'
  | 'petersburg'
  | 'istanbul'
  | 'berlin'
  | 'london'
  | 'paris'
  | 'shanghai'
  | 'cancun'
  | 'prague'
  | 'osaka'

/**
 * Maps hardfork name to its ChainRules flag name
 */
type HardforkToFlag<H extends string> = H extends 'homestead'
  ? 'isHomestead'
  : H extends 'dao'
    ? 'isDAO'
    : H extends 'tangerineWhistle'
      ? 'isTangerineWhistle'
      : H extends 'spuriousDragon'
        ? 'isSpuriousDragon'
        : H extends 'byzantium'
          ? 'isByzantium'
          : H extends 'constantinople'
            ? 'isConstantinople'
            : H extends 'petersburg'
              ? 'isPetersburg'
              : H extends 'istanbul'
                ? 'isIstanbul'
                : H extends 'berlin'
                  ? 'isBerlin'
                  : H extends 'london'
                    ? 'isLondon'
                    : H extends 'paris'
                      ? 'isParis'
                      : H extends 'shanghai'
                        ? 'isShanghai'
                        : H extends 'cancun'
                          ? 'isCancun'
                          : H extends 'prague'
                            ? 'isPrague'
                            : H extends 'osaka'
                              ? 'isOsaka'
                              : never

/**
 * Build ChainRules type from schema hardfork names.
 * Only includes flags for hardforks that are actually in the schema.
 */
export type SchemaChainRules<AvailableHardforks extends string> = {
  /** Chain ID for replay protection */
  chainId: bigint
} & {
  // Only include flags for hardforks in the schema
  [K in AvailableHardforks &
    StandardHardforkFlags as HardforkToFlag<K>]: boolean
} & {
  // EIP flags based on what hardforks are present
  isEIP1559: 'london' extends AvailableHardforks ? boolean : never
  isEIP2929: 'berlin' extends AvailableHardforks ? boolean : never
  isEIP4844: 'cancun' extends AvailableHardforks ? boolean : never
  isEIP7702: 'prague' extends AvailableHardforks ? boolean : never
}

/**
 * Clean up the SchemaChainRules by removing `never` properties
 */
export type CleanSchemaChainRules<AvailableHardforks extends string> = {
  [K in keyof SchemaChainRules<AvailableHardforks> as SchemaChainRules<AvailableHardforks>[K] extends never
    ? never
    : K]: SchemaChainRules<AvailableHardforks>[K]
}

/**
 * HardforkParamManager manages hardfork parameters and EIP activation.
 *
 * @typeParam H - Union of hardfork names available in this manager.
 *                Derived from schema when using createFromSchema.
 *
 * @example
 * ```ts
 * // Type-safe with schema (recommended)
 * const manager = HardforkParamManager.createFromSchema(
 *   'london',
 *   createHardforkSchema({
 *     hardforks: [
 *       hardforkEntry('chainstart', { block: 0n, optional: true }),
 *       hardforkEntry('london', { block: 100, optional: true }),
 *       hardforkEntry('myCustomFork', { block: null, timestamp: '2000' }),
 *     ] as const,
 *     chainId: 1337n,
 *   })
 * )
 *
 * // Type inference knows exactly which forks are valid
 * manager.withHardfork('london')        // ✅ OK
 * manager.withHardfork('myCustomFork')  // ✅ OK
 * manager.withHardfork('homestead')     // ❌ Error: not in schema
 *
 * // rules() only has flags for forks in the schema
 * const rules = manager.rules(100n, 0n)
 * rules.isLondon  // ✅ OK - london is in schema
 * ```
 */
export class HardforkParamManager<
  H extends string = Hardfork,
  SchemaH extends string = Hardfork,
> {
  public _currentHardfork: H
  public _overrides: ParamsConfig
  public _schema: HardforkSchema | null = null

  /**
   * Create a HardforkParamManager from a typed schema.
   * This is the recommended way to create a manager with full type safety.
   *
   * @param hardfork - Initial hardfork (must be in schema)
   * @param schema - Typed schema created with createHardforkSchema
   * @param overrides - Optional parameter overrides
   * @returns A type-safe HardforkParamManager
   *
   * @example
   * ```ts
   * const schema = createHardforkSchema({
   *   hardforks: [
   *     hardforkEntry('chainstart', { block: 0n, optional: true }),
   *     hardforkEntry('london', { block: 100, optional: true }),
   *     hardforkEntry('myCustomFork', { block: null, timestamp: '2000' }),
   *   ] as const,
   *   chainId: 1337n,
   * })
   *
   * // TypeScript knows exactly which forks are available
   * const manager = HardforkParamManager.createFromSchema('london', schema)
   * ```
   */
  static createFromSchema<
    const Entries extends readonly HardforkSchemaEntry<string>[],
    Hardfork extends Entries[number]['name'],
  >(
    hardfork: Hardfork,
    schema: TypedHardforkSchema<Entries>,
    overrides?: ParamsConfig,
  ): HardforkParamManager<Hardfork, ExtractHardforkNames<Entries>> {
    const manager = new HardforkParamManager<
      ExtractHardforkNames<Entries>,
      ExtractHardforkNames<Entries>
    >(hardfork)
    manager._overrides = overrides ?? {}
    validateForkOrder(
      schema.hardforks as readonly HardforkSchemaEntry<string>[],
      schema.validationOpts,
    )
    manager._schema = schema as unknown as HardforkSchema

    // @ts-expect-error - this is a workaround to fix the type error
    return manager.withHardfork<ExtractHardforkNames<Hardfork>>(hardfork)
  }

  /**
   * Create a HardforkParamManager
   *
   * @param hardfork - Initial hardfork to use
   * @param optsOrOverrides - Either HardforkParamManagerOpts or legacy ParamsConfig
   *
   * @example
   * ```ts
   * // Simple usage (no validation)
   * const manager = new HardforkParamManager(Hardfork.London)
   *
   * // With schema validation (validates fork ordering like geth)
   * const manager = new HardforkParamManager(Hardfork.London, {
   *   schema: {
   *     hardforks: chain.hardforks,
   *     chainId: BigInt(chain.chainId),
   *   },
   * })
   *
   * // For full type safety, use createFromSchema instead
   * ```
   */
  constructor(
    hardfork: H,
    optsOrOverrides?: HardforkParamManagerOpts | ParamsConfig,
  ) {
    this._currentHardfork = hardfork
    this._overrides = {}

    // Handle both legacy (ParamsConfig) and new (HardforkParamManagerOpts) signatures
    if (optsOrOverrides && 'schema' in optsOrOverrides) {
      const opts = optsOrOverrides as HardforkParamManagerOpts
      this._overrides = opts.overrides ?? {}

      // Validate schema if provided
      if (opts.schema) {
        validateForkOrder(
          opts.schema.hardforks as readonly HardforkSchemaEntry<string>[],
          opts.schema.validationOpts,
        )
        this._schema = opts.schema
      }
    } else if (optsOrOverrides) {
      // Legacy: treat as ParamsConfig
      this._overrides = optsOrOverrides as ParamsConfig
    }
  }

  get currentHardfork(): H {
    return this._currentHardfork
  }

  get activeEips(): Set<EIP> {
    // Cast to Hardfork - custom hardforks return empty set
    return getCumulativeEIPs(this._currentHardfork as Hardfork)
  }

  getParamByEIP<
    E extends EIPWithHardfork & EIPWithParams,
    K extends EIPParamKeys<E>,
  >(
    eip: H extends MinHardforkFor[E] ? E : never,
    param: K,
  ): EIPParamType<E, K> {
    // Cast to Hardfork - custom hardforks always return false
    if (!isEIPActiveAtHardfork(eip as EIP, this._currentHardfork as Hardfork)) {
      throw new Error(
        `EIP ${eip} is not active at hardfork ${this._currentHardfork}`,
      )
    }

    return getEIPParam(eip, param)
  }

  forEIP<E extends EIPWithParams>(eip: E): EIPAccessor<E> | null {
    // Cast to Hardfork - custom hardforks always return null
    if (!isEIPActiveAtHardfork(eip as EIP, this._currentHardfork as Hardfork)) {
      return null
    }
    return new EIPAccessor(eip)
  }

  getParam<T extends keyof ChainParams>(name: T): ChainParams[T] | undefined {
    // Check overrides first
    const override = this._overrides[name as string]
    if (override !== undefined) {
      return override as ChainParams[T]
    }

    // Fall back to EIP params
    const activeEips = this.activeEips
    let result: ChainParams[T] | undefined

    for (const eip of activeEips) {
      const value = getRawParam(eip, name as string)
      if (value !== undefined) {
        result = value as ChainParams[T]
      }
    }

    return result as ChainParams[T] | undefined
  }

  updateParams(overrides: ParamsConfig): this {
    this._overrides = { ...this._overrides, ...overrides }
    return this
  }

  clearOverrides(): this {
    this._overrides = {}
    return this
  }

  getOverrides(): ParamsConfig {
    return { ...this._overrides }
  }

  isEIPActive(eip: EIP): boolean {
    // Cast to Hardfork - custom hardforks always return false
    return isEIPActiveAtHardfork(eip, this._currentHardfork as Hardfork)
  }

  /**
   * Get the hardfork that introduced a specific EIP.
   * Returns undefined if the EIP is not recognized.
   */
  getHardforkForEIP(eip: number): string | undefined {
    // Import from eips to check EIP-to-hardfork mapping
    const { eipsDict } = require('../fork-params/eips')
    const eipInfo = eipsDict[eip]
    if (!eipInfo) return undefined
    return eipInfo.minimumHardfork
  }

  /**
   * Create a new manager set to a different hardfork.
   * The hardfork must be one that exists in the schema.
   *
   * @param hardfork - The hardfork to switch to (must be in SchemaH)
   * @returns A new HardforkParamManager at the specified hardfork
   */
  withHardfork<NewH extends SchemaH>(
    hardfork: NewH,
  ): HardforkParamManager<NewH, SchemaH> {
    const manager = new HardforkParamManager<NewH, SchemaH>(hardfork)
    manager._overrides = { ...this._overrides }
    manager._schema = this._schema
    return manager
  }

  copy(): HardforkParamManager<H, SchemaH> {
    const manager = new HardforkParamManager<H, SchemaH>(this._currentHardfork)
    manager._overrides = { ...this._overrides }
    manager._schema = this._schema
    return manager
  }

  /**
   * Check if a schema was provided and validated
   */
  get hasSchema(): boolean {
    return this._schema !== null
  }

  /**
   * Get the validated schema if available
   */
  get schema(): HardforkSchema | null {
    return this._schema
  }

  /**
   * Get ChainRules for a specific block/timestamp.
   * Pre-computes all fork activation flags for fast runtime checks.
   *
   * The returned type only includes flags for hardforks in your schema.
   *
   * @param blockNumber - Current block number
   * @param timestamp - Current block timestamp
   * @returns ChainRules with fork activation flags (typed based on schema)
   * @throws Error if no schema was provided
   *
   * @example
   * ```ts
   * const rules = manager.rules(blockNumber, timestamp)
   * if (rules.isLondon) {  // Only available if 'london' is in schema
   *   // Use EIP-1559 base fee
   * }
   * ```
   */
  rules(
    blockNumber: bigint,
    timestamp: bigint,
  ): CleanSchemaChainRules<SchemaH> {
    if (!this._schema) {
      throw new Error('No schema provided - pass schema to constructor')
    }
    return buildChainRules(
      this._schema.hardforks as readonly HardforkSchemaEntry<string>[],
      this._schema.chainId,
      blockNumber,
      timestamp,
    ) as unknown as CleanSchemaChainRules<SchemaH>
  }

  /**
   * Check if a hardfork is in the schema
   */
  hasHardfork(hardfork: string): hardfork is SchemaH {
    if (!this._schema) return false
    return this._schema.hardforks.some((hf) => hf.name === hardfork)
  }

  /**
   * Get the active hardfork for this manager
   */
  get activeHardfork(): H {
    return this._currentHardfork
  }
}
