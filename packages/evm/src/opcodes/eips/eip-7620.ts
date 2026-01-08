/**
 * EIP-7620: EOF - Create instructions
 * Adds EOFCREATE and RETURNCONTRACT opcodes
 */
import { Op } from '../constants'
import { opEofcreate, opReturncontract } from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-7620 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP7620(table: JumpTable): JumpTable {
  // EOFCREATE - Create contract with EOF container
  table[Op.EOFCREATE] = makeOperation({
    execute: opEofcreate,
    minStack: 4,
    maxStack: 1021,
    isAsync: true,
  })

  // RETURNCONTRACT - Return from init code with contract
  table[Op.RETURNCONTRACT] = makeOperation({
    execute: opReturncontract,
    minStack: 2,
    maxStack: 1022,
    isAsync: true,
  })

  return table
}
