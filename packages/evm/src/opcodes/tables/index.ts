/**
 * Jump Tables index - exports all hardfork-specific jump tables
 */

import type { JumpTable } from '../types'
import { createBerlinJumpTable } from './berlin'
import { createByzantiumJumpTable } from './byzantium'
import { createCancunJumpTable } from './cancun'
import { createConstantinopleJumpTable } from './constantinople'
import { createFrontierJumpTable } from './frontier'
import { createHomesteadJumpTable } from './homestead'
import { createIstanbulJumpTable } from './istanbul'
import { createLondonJumpTable } from './london'
import { createOsakaJumpTable } from './osaka'
import { createParisJumpTable } from './paris'
import { createShanghaiJumpTable } from './shanghai'
import { createTangerineWhistleJumpTable } from './tangerineWhistle'

export { createBerlinJumpTable } from './berlin'
export { createByzantiumJumpTable } from './byzantium'
export { createCancunJumpTable } from './cancun'
export { createConstantinopleJumpTable } from './constantinople'
// Re-export hardfork progression (oldest to newest)
export { createFrontierJumpTable } from './frontier'
export { createHomesteadJumpTable } from './homestead'
export { createIstanbulJumpTable } from './istanbul'
export { createLondonJumpTable } from './london'
export { createOsakaJumpTable } from './osaka'
export { createParisJumpTable } from './paris'
export { createShanghaiJumpTable } from './shanghai'
export { createTangerineWhistleJumpTable } from './tangerineWhistle'

/**
 * Map of hardfork names to their jump table factory functions
 * Keys are lowercase for case-insensitive lookup
 */
export const jumpTableFactories: Record<string, () => JumpTable> = {
  // Genesis / Frontier
  chainstart: createFrontierJumpTable,
  frontier: createFrontierJumpTable,
  // DAO hardfork doesn't change opcodes
  dao: createFrontierJumpTable,
  // Homestead
  homestead: createHomesteadJumpTable,
  // Tangerine Whistle / EIP-150
  tangerinewhistle: createTangerineWhistleJumpTable,
  spuriousdragon: createTangerineWhistleJumpTable,
  // Byzantium
  byzantium: createByzantiumJumpTable,
  // Constantinople / Petersburg
  constantinople: createConstantinopleJumpTable,
  petersburg: createConstantinopleJumpTable,
  // Istanbul
  istanbul: createIstanbulJumpTable,
  muirglacier: createIstanbulJumpTable,
  // Berlin
  berlin: createBerlinJumpTable,
  // London
  london: createLondonJumpTable,
  arrowglacier: createLondonJumpTable,
  grayglacier: createLondonJumpTable,
  // Paris / The Merge
  paris: createParisJumpTable,
  merge: createParisJumpTable,
  mergenetsplitblock: createParisJumpTable,
  // Shanghai
  shanghai: createShanghaiJumpTable,
  // Cancun
  cancun: createCancunJumpTable,
  // Prague
  prague: createCancunJumpTable,
  // Osaka
  osaka: createOsakaJumpTable,
  // Future hardforks (use Osaka as base)
  bpo1: createOsakaJumpTable,
  bpo2: createOsakaJumpTable,
  bpo3: createOsakaJumpTable,
  bpo4: createOsakaJumpTable,
  bpo5: createOsakaJumpTable,
}

/**
 * Get the jump table for a given hardfork
 * @param hardfork The hardfork name (case-insensitive)
 * @returns The jump table for that hardfork
 */
export function getJumpTableForHardfork(hardfork: string): JumpTable {
  const normalizedFork = hardfork.toLowerCase()
  const factory = jumpTableFactories[normalizedFork]
  if (!factory) {
    throw new Error(`Unknown hardfork: ${hardfork}`)
  }
  return factory()
}
