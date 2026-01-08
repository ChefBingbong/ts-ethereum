/**
 * EIP-663: Unlimited SWAP and DUP instructions
 * Adds DUPN, SWAPN, EXCHANGE opcodes
 */
import { Op } from '../constants'
import { opDupn, opExchange, opSwapn } from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-663 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP663(table: JumpTable): JumpTable {
  // DUPN - Duplicate Nth stack item with immediate
  table[Op.DUPN] = makeOperation({
    execute: opDupn,
    minStack: 1,
    maxStack: 1024,
  })

  // SWAPN - Swap top with Nth stack item with immediate
  table[Op.SWAPN] = makeOperation({
    execute: opSwapn,
    minStack: 2,
    maxStack: 1024,
  })

  // EXCHANGE - Exchange two stack items
  table[Op.EXCHANGE] = makeOperation({
    execute: opExchange,
    minStack: 3,
    maxStack: 1024,
  })

  return table
}
