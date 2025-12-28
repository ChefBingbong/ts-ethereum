/**
 * Global Chain Configuration Module
 *
 * This module provides the core chain configuration system including:
 * - GlobalConfig: The main configuration class
 * - Schema system: Type-safe chain schema definitions
 * - HardforkParamManager: Hardfork-based parameter management
 *
 * @example
 * ```ts
 * import {
 *   GlobalConfig,
 *   createChainSchema,
 *   hardfork,
 * } from '@ts-ethereum/chain-config/global'
 *
 * const myChain = createChainSchema({
 *   chainId: 12345n,
 *   name: 'my-chain',
 *   genesis: { ... },
 *   consensus: { type: 'pow', algorithm: 'ethash' },
 *   hardforks: [
 *     hardfork('chainstart', { block: 0n, eips: [1] }),
 *     hardfork('london', { block: 100n, eips: [1559, 3198, 3529] }),
 *   ],
 * })
 *
 * const config = GlobalConfig.fromChainSchema({ schema: myChain })
 * ```
 */

// Getters
export {
  getCumulativeEIPs,
  getEIPParam,
  getRawParam,
  getTypedParam,
  isEIPActiveAtHardfork,
} from './getters'
export type {
  ChainSchemaConfigOpts,
  TypedGlobalConfigOpts,
} from './global-config'

// Core classes
export { GlobalConfig } from './global-config'
export type {
  CleanSchemaChainRules,
  HardforkParamManagerOpts,
  HardforkSchema,
  HardforkSchemaEntry,
  SchemaChainRules,
  TypedHardforkParamManagerOpts,
  TypedHardforkSchema,
} from './param-manager'

export {
  createHardforkSchema,
  EIPAccessor,
  HardforkParamManager,
  hardforkEntry,
} from './param-manager'
// Schema builders
export {
  createChainSchema,
  getActiveHardfork,
  getAllEIPsFromSchema,
  getEIPsAtHardfork,
  getHardforkForEIP,
  hardfork,
  isEIPActiveAt,
  standardHardfork,
  validateChainSchema,
} from './schema'
// Schema types - all exported from schema.types.ts
export type {
  ChainSchemaDef,
  ConsensusSchemaConfig,
  ExtractEIPsForHardfork,
  ExtractEIPsFromHardforks,
  ExtractSchemaHardforkNames,
  GenesisSchemaConfig,
  HardforkWithEIPs,
  InferHardforkNames,
  InferParamsFromEIPs,
  InferParamsFromSchema,
  UnionToIntersection,
  ValidatedChainSchemaDef,
  ValidatedHardforkWithEIPs,
} from './schema.types'
// EIP types and mappings
export type {
  EIPParamKeys,
  EIPParamsMap,
  EIPParamType,
  EIPWithHardfork,
  EIPWithParams,
  IsEIPActiveAt,
  MinHardforkFor,
} from './types'
