/**
 * EIP-4750: EOF - Functions
 * Adds CALLF and RETF opcodes
 */
import { Op } from '../constants'
import { opCallf, opRetf } from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-4750 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP4750(table: JumpTable): JumpTable {
  // CALLF - Call a function in another code section
  table[Op.CALLF] = makeOperation({
    execute: opCallf,
    minStack: 0,
    maxStack: 1024,
  })

  // RETF - Return from function
  table[Op.RETF] = makeOperation({
    execute: opRetf,
    minStack: 0,
    maxStack: 1024,
  })

  return table
}
