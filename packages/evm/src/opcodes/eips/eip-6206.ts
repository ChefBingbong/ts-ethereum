/**
 * EIP-6206: EOF - JUMPF instruction
 * Adds JUMPF opcode for tail calls
 */
import { Op } from '../constants'
import { opJumpf } from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-6206 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP6206(table: JumpTable): JumpTable {
  // JUMPF - Jump to a function (tail call)
  table[Op.JUMPF] = makeOperation({
    execute: opJumpf,
    minStack: 0,
    maxStack: 1024,
  })

  return table
}
