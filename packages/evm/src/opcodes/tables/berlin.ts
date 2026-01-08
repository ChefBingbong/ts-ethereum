/**
 * Berlin Jump Table
 * EIP-2929 access list changes (gas cost adjustments only)
 */
import type { JumpTable } from '../types'
import { createIstanbulJumpTable } from './istanbul'

/**
 * Create the Berlin jump table
 * Builds on Istanbul
 * Berlin introduced EIP-2929 (gas cost changes for state access)
 * No new opcodes, just gas accounting changes handled at runtime
 */
export function createBerlinJumpTable(): JumpTable {
  // Berlin only changed gas costs via EIP-2929, not opcodes
  return createIstanbulJumpTable()
}
