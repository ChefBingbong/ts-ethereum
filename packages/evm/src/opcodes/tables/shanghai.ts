/**
 * Shanghai Jump Table
 * Adds PUSH0 (EIP-3855)
 */
import { Op } from '../constants'
import { opPush0 } from '../instructions/stack'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createParisJumpTable } from './paris'

/**
 * Create the Shanghai jump table
 * Builds on Paris, adding:
 * - PUSH0 (0x5f) - EIP-3855
 */
export function createShanghaiJumpTable(): JumpTable {
  const table = createParisJumpTable()

  // PUSH0 - EIP-3855
  table[Op.PUSH0] = makeOperation({
    execute: opPush0,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
