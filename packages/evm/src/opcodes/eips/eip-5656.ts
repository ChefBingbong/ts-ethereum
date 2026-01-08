/**
 * EIP-5656: MCOPY - Memory copying instruction
 * Adds MCOPY opcode
 */
import { Op } from '../constants'
import { opMcopy } from '../instructions/memory'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-5656 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP5656(table: JumpTable): JumpTable {
  // MCOPY - Copy memory areas
  table[Op.MCOPY] = makeOperation({
    execute: opMcopy,
    minStack: 3,
    maxStack: 1021,
  })

  return table
}
