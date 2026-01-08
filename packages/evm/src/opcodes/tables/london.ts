/**
 * London Jump Table
 * Adds BASEFEE (EIP-3198)
 */
import { Op } from '../constants'
import { opBasefee } from '../instructions/block'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createBerlinJumpTable } from './berlin'

/**
 * Create the London jump table
 * Builds on Berlin, adding:
 * - BASEFEE (0x48) - EIP-3198
 */
export function createLondonJumpTable(): JumpTable {
  const table = createBerlinJumpTable()

  // BASEFEE - EIP-3198
  table[Op.BASEFEE] = makeOperation({
    execute: opBasefee,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
