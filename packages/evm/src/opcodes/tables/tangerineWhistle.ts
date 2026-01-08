/**
 * Tangerine Whistle (EIP-150) Jump Table
 * Gas cost changes only - no new opcodes
 * This is identical to Homestead structurally, but gas costs differ
 */
import type { JumpTable } from '../types'
import { createHomesteadJumpTable } from './homestead'

/**
 * Create the Tangerine Whistle jump table
 * Builds on Homestead with gas cost adjustments (handled at runtime)
 * No new opcodes added
 */
export function createTangerineWhistleJumpTable(): JumpTable {
  // Tangerine Whistle only changed gas costs, not opcodes
  // Gas costs are handled by the gas.ts dynamic gas handlers
  return createHomesteadJumpTable()
}
