/**
 * EIP-7939: CLZ (Count Leading Zeros) instruction
 * Adds CLZ opcode
 */
import { Op } from '../constants'
import { opClz } from '../instructions/bitwise'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-7939 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP7939(table: JumpTable): JumpTable {
  // CLZ - Count leading zeros
  table[Op.CLZ] = makeOperation({
    execute: opClz,
    minStack: 1,
    maxStack: 1024,
  })

  return table
}
