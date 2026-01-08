/**
 * EIP-3855: PUSH0 instruction
 * Adds PUSH0 opcode to push 0 onto the stack
 */
import { Op } from '../constants'
import { opPush0 } from '../instructions/stack'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-3855 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP3855(table: JumpTable): JumpTable {
  // PUSH0 - Push zero onto the stack
  table[Op.PUSH0] = makeOperation({
    execute: opPush0,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
