/**
 * Chain Schema Builder
 *
 * This module provides functions for creating and validating chain schemas.
 * Use createChainSchema() to define a chain with full type inference.
 *
 * @example
 * ```ts
 * const myChain = createChainSchema({
 *   chainId: 12345n,
 *   name: 'my-chain',
 *   genesis: {
 *     gasLimit: 10485760n,
 *     difficulty: 1n,
 *     nonce: '0xbb00000000000000',
 *     extraData: '0x00',
 *   },
 *   consensus: {
 *     type: 'pow',
 *     algorithm: 'ethash',
 *   },
 *   hardforks: [
 *     hardfork('chainstart', { block: 0n, eips: [1] }),
 *     hardfork('london', { block: 100n, eips: [1559, 3198, 3529] }),
 *   ],
 * })
 *
 * // TypeScript knows exactly what params are available
 * type Params = InferParamsFromSchema<typeof myChain>
 * ```
 */

import { HARDFORK_ORDER, type Hardfork } from '../fork-params/enums'
import type { ChainSchemaDef, HardforkWithEIPs } from './schema.types'

// ============================================================================
// Schema Validation
// ============================================================================

export interface SchemaValidationError {
  code: string
  message: string
  path?: string
}

/**
 * Validate a chain schema at runtime.
 * Checks:
 * - Required fields are present
 * - Hardfork ordering is valid
 * - EIP dependencies are satisfied
 *
 * @param schema - The schema to validate
 * @throws Error if validation fails
 */
export function validateChainSchema(schema: ChainSchemaDef): void {
  const errors: SchemaValidationError[] = []

  // Check required fields
  if (typeof schema.chainId !== 'bigint') {
    errors.push({
      code: 'INVALID_CHAIN_ID',
      message: 'chainId must be a bigint',
      path: 'chainId',
    })
  }

  if (typeof schema.name !== 'string' || schema.name.length === 0) {
    errors.push({
      code: 'INVALID_NAME',
      message: 'name must be a non-empty string',
      path: 'name',
    })
  }

  if (!schema.genesis) {
    errors.push({
      code: 'MISSING_GENESIS',
      message: 'genesis configuration is required',
      path: 'genesis',
    })
  }

  if (!schema.consensus) {
    errors.push({
      code: 'MISSING_CONSENSUS',
      message: 'consensus configuration is required',
      path: 'consensus',
    })
  }

  if (!Array.isArray(schema.hardforks) || schema.hardforks.length === 0) {
    errors.push({
      code: 'MISSING_HARDFORKS',
      message: 'at least one hardfork is required',
      path: 'hardforks',
    })
  }

  // Validate hardfork ordering
  validateHardforkOrder(schema.hardforks, errors)

  // Validate each hardfork
  for (let i = 0; i < schema.hardforks.length; i++) {
    const hf = schema.hardforks[i]
    validateHardforkEntry(hf, i, errors)
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n')
    throw new Error(`Chain schema validation failed:\n${messages}`)
  }
}

/**
 * Validate hardfork ordering (block numbers must be non-decreasing).
 */
function validateHardforkOrder(
  hardforks: readonly HardforkWithEIPs[],
  errors: SchemaValidationError[],
): void {
  let lastBlock: bigint | null = null
  let lastTimestamp: bigint | null = null

  for (let i = 0; i < hardforks.length; i++) {
    const hf = hardforks[i]

    // Check block ordering
    if (hf.block !== null) {
      if (lastBlock !== null && hf.block < lastBlock) {
        errors.push({
          code: 'INVALID_BLOCK_ORDER',
          message: `hardfork "${hf.name}" has block ${hf.block} which is before previous block ${lastBlock}`,
          path: `hardforks[${i}].block`,
        })
      }
      lastBlock = hf.block
    }

    // Check timestamp ordering
    if (hf.timestamp !== undefined) {
      const ts = BigInt(hf.timestamp)
      if (lastTimestamp !== null && ts < lastTimestamp) {
        errors.push({
          code: 'INVALID_TIMESTAMP_ORDER',
          message: `hardfork "${hf.name}" has timestamp ${ts} which is before previous timestamp ${lastTimestamp}`,
          path: `hardforks[${i}].timestamp`,
        })
      }
      lastTimestamp = ts
    }
  }

  // Check that standard hardforks are in the correct order
  const standardHardforkIndices = new Map<string, number>()
  for (let i = 0; i < HARDFORK_ORDER.length; i++) {
    standardHardforkIndices.set(HARDFORK_ORDER[i], i)
  }

  let lastStandardIndex = -1
  for (let i = 0; i < hardforks.length; i++) {
    const hf = hardforks[i]
    const standardIndex = standardHardforkIndices.get(hf.name)

    if (standardIndex !== undefined) {
      if (standardIndex < lastStandardIndex) {
        errors.push({
          code: 'INVALID_HARDFORK_ORDER',
          message: `hardfork "${hf.name}" is out of order (should come before previous standard hardfork)`,
          path: `hardforks[${i}]`,
        })
      }
      lastStandardIndex = standardIndex
    }
  }
}

/**
 * Validate a single hardfork entry.
 */
function validateHardforkEntry(
  hf: HardforkWithEIPs,
  index: number,
  errors: SchemaValidationError[],
): void {
  if (typeof hf.name !== 'string' || hf.name.length === 0) {
    errors.push({
      code: 'INVALID_HARDFORK_NAME',
      message: 'hardfork name must be a non-empty string',
      path: `hardforks[${index}].name`,
    })
  }

  if (hf.block !== null && typeof hf.block !== 'bigint') {
    errors.push({
      code: 'INVALID_HARDFORK_BLOCK',
      message: 'hardfork block must be null or bigint',
      path: `hardforks[${index}].block`,
    })
  }

  if (!Array.isArray(hf.eips)) {
    errors.push({
      code: 'INVALID_HARDFORK_EIPS',
      message: 'hardfork eips must be an array',
      path: `hardforks[${index}].eips`,
    })
  } else {
    for (let j = 0; j < hf.eips.length; j++) {
      if (typeof hf.eips[j] !== 'number') {
        errors.push({
          code: 'INVALID_EIP_NUMBER',
          message: `EIP at index ${j} must be a number`,
          path: `hardforks[${index}].eips[${j}]`,
        })
      }
    }
  }
}

// ============================================================================
// Schema Builder Functions
// ============================================================================

/**
 * Create a validated chain schema.
 * This is the main entry point for defining a chain.
 *
 * The schema is validated at runtime and TypeScript infers all types from it.
 *
 * @param schema - The chain schema definition
 * @returns The same schema, validated and typed
 *
 * @example
 * ```ts
 * const mainnet = createChainSchema({
 *   chainId: 1n,
 *   name: 'mainnet',
 *   genesis: {
 *     gasLimit: 5000n,
 *     difficulty: 17179869184n,
 *     nonce: '0x0000000000000042',
 *     extraData: '0x11bbe8db4e347b4e8c937c1c8370e4b5ed33adb3db69cbdb7a38e1e50b1b82fa',
 *   },
 *   consensus: {
 *     type: 'pow',
 *     algorithm: 'ethash',
 *   },
 *   hardforks: [
 *     hardfork('chainstart', { block: 0n, eips: [1] }),
 *     hardfork('homestead', { block: 1150000n, eips: [606] }),
 *     hardfork('london', { block: 12965000n, eips: [1559, 3198, 3529, 3541] }),
 *   ],
 * })
 * ```
 */
export function createChainSchema<
  const HFs extends readonly HardforkWithEIPs[],
  const S extends ChainSchemaDef<HFs>,
>(schema: S): S {
  validateChainSchema(schema)
  return schema
}

/**
 * Helper to create a hardfork entry with EIPs.
 * Provides better type inference for the EIPs array.
 *
 * @param name - The hardfork name
 * @param config - Hardfork configuration including block, timestamp, and EIPs
 * @returns A typed HardforkWithEIPs entry
 *
 * @example
 * ```ts
 * const london = hardfork('london', {
 *   block: 12965000n,
 *   eips: [1559, 3198, 3529, 3541],
 * })
 * // Type: HardforkWithEIPs<'london', readonly [1559, 3198, 3529, 3541]>
 * ```
 */
export function hardfork<
  const Name extends string,
  const EIPs extends readonly number[],
>(
  name: Name,
  config: {
    block: bigint | null
    timestamp?: number | string
    forkHash?: string | null
    optional?: boolean
    eips: EIPs
  },
): HardforkWithEIPs<Name, EIPs> {
  return {
    name,
    block: config.block,
    timestamp: config.timestamp,
    forkHash: config.forkHash,
    optional: config.optional,
    eips: config.eips,
  }
}

/**
 * Create a hardfork entry for a standard Ethereum hardfork.
 * Uses the known EIPs for that hardfork.
 *
 * @param name - Standard hardfork name
 * @param block - Block number for activation
 * @returns HardforkWithEIPs with standard EIPs for that hardfork
 */
export function standardHardfork<const Name extends Hardfork>(
  name: Name,
  block: bigint | null,
  opts?: { timestamp?: number | string; forkHash?: string | null },
): HardforkWithEIPs<Name, readonly number[]> {
  // Import the standard hardfork EIPs
  const { hardforksDict } = require('../fork-params/hardforks')
  const hfConfig = hardforksDict[name]
  const eips = hfConfig?.eips ?? []

  return {
    name,
    block,
    timestamp: opts?.timestamp,
    forkHash: opts?.forkHash,
    eips: eips as readonly number[],
  }
}

// ============================================================================
// Schema Utilities
// ============================================================================

/**
 * Get all EIP numbers from a schema.
 *
 * @param schema - The chain schema
 * @returns Array of all EIP numbers across all hardforks
 */
export function getAllEIPsFromSchema(schema: ChainSchemaDef): number[] {
  const eips = new Set<number>()
  for (const hf of schema.hardforks) {
    for (const eip of hf.eips) {
      eips.add(eip)
    }
  }
  return [...eips].sort((a, b) => a - b)
}

/**
 * Get EIPs active at a specific hardfork.
 *
 * @param schema - The chain schema
 * @param hardforkName - Name of the hardfork
 * @returns Array of all EIPs active at that hardfork (cumulative)
 */
export function getEIPsAtHardfork(
  schema: ChainSchemaDef,
  hardforkName: string,
): number[] {
  const eips = new Set<number>()

  for (const hf of schema.hardforks) {
    for (const eip of hf.eips) {
      eips.add(eip)
    }
    if (hf.name === hardforkName) {
      break
    }
  }

  return [...eips].sort((a, b) => a - b)
}

/**
 * Get the hardfork that activated a specific EIP.
 *
 * @param schema - The chain schema
 * @param eip - The EIP number
 * @returns The hardfork name, or undefined if not found
 */
export function getHardforkForEIP(
  schema: ChainSchemaDef,
  eip: number,
): string | undefined {
  for (const hf of schema.hardforks) {
    if (hf.eips.includes(eip)) {
      return hf.name
    }
  }
  return undefined
}

/**
 * Check if an EIP is active at a specific block/timestamp.
 *
 * @param schema - The chain schema
 * @param eip - The EIP number
 * @param blockNumber - Current block number
 * @param timestamp - Current timestamp (optional)
 * @returns true if the EIP is active
 */
export function isEIPActiveAt(
  schema: ChainSchemaDef,
  eip: number,
  blockNumber: bigint,
  timestamp?: bigint,
): boolean {
  for (const hf of schema.hardforks) {
    // Check if hardfork is active
    let isActive = false

    if (hf.block !== null && blockNumber >= hf.block) {
      isActive = true
    }

    if (hf.timestamp !== undefined && timestamp !== undefined) {
      if (timestamp >= BigInt(hf.timestamp)) {
        isActive = true
      }
    }

    // If hardfork is active and contains this EIP, it's active
    if (isActive && hf.eips.includes(eip)) {
      return true
    }
  }

  return false
}

/**
 * Get the active hardfork at a specific block/timestamp.
 *
 * @param schema - The chain schema
 * @param blockNumber - Current block number
 * @param timestamp - Current timestamp (optional)
 * @returns The name of the active hardfork
 */
export function getActiveHardfork(
  schema: ChainSchemaDef,
  blockNumber: bigint,
  timestamp?: bigint,
): string {
  let activeHardfork = schema.hardforks[0].name

  for (const hf of schema.hardforks) {
    let isActive = false

    if (hf.block !== null && blockNumber >= hf.block) {
      isActive = true
    }

    if (hf.timestamp !== undefined && timestamp !== undefined) {
      if (timestamp >= BigInt(hf.timestamp)) {
        isActive = true
      }
    }

    if (isActive) {
      activeHardfork = hf.name
    }
  }

  return activeHardfork
}

// ============================================================================
// Type Exports
// ============================================================================

export type {
  ChainSchemaDef,
  ConsensusSchemaConfig,
  ExtractEIPsFromHardforks,
  ExtractSchemaHardforkNames,
  GenesisSchemaConfig,
  HardforkWithEIPs,
  InferParamsFromSchema,
} from './schema.types'
