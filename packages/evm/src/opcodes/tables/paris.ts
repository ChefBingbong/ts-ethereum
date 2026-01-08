/**
 * Paris (The Merge) Jump Table
 * DIFFICULTY becomes PREVRANDAO (EIP-4399)
 */
import type { JumpTable } from '../types'
import { createLondonJumpTable } from './london'

/**
 * Create the Paris (The Merge) jump table
 * Builds on London
 * Paris renamed DIFFICULTY to PREVRANDAO via EIP-4399
 * The opcode handler already handles both cases based on hardfork
 */
export function createParisJumpTable(): JumpTable {
  // The DIFFICULTY/PREVRANDAO handler checks EIP-4399 activation internally
  // No structural changes needed to the jump table
  return createLondonJumpTable()
}
