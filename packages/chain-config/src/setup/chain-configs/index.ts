/**
 * Pre-configured chain schemas and managers.
 *
 * @example
 * ```ts
 * import {
 *   mainnetManager,
 *   testnetManager,
 *   createMainnetManager,
 *   createTestnetManager,
 * } from '@ts-ethereum/chain-config'
 *
 * // Use pre-configured managers
 * const rules = mainnetManager.rules(blockNumber, timestamp)
 *
 * // Or create custom instances
 * const customManager = createTestnetManager('cancun', { myOverride: 100n })
 * ```
 */

export * from './mainnet'
export * from './testnet'
