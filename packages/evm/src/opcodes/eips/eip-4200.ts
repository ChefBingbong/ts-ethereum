/**
 * EIP-4200: EOF - Static relative jumps
 * Adds RJUMP, RJUMPI, RJUMPV opcodes
 */
import { Op } from '../constants'
import { opRjump, opRjumpi, opRjumpv } from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-4200 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP4200(table: JumpTable): JumpTable {
  // RJUMP - Relative jump
  table[Op.RJUMP] = makeOperation({
    execute: opRjump,
    minStack: 0,
    maxStack: 1024,
  })

  // RJUMPI - Conditional relative jump
  table[Op.RJUMPI] = makeOperation({
    execute: opRjumpi,
    minStack: 1,
    maxStack: 1023,
  })

  // RJUMPV - Relative jump via jump table
  table[Op.RJUMPV] = makeOperation({
    execute: opRjumpv,
    minStack: 1,
    maxStack: 1023,
  })

  return table
}
