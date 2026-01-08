/**
 * EIP-3198: BASEFEE opcode
 * Adds BASEFEE opcode to retrieve current block base fee
 */
import { Op } from '../constants'
import { opBasefee } from '../instructions/block'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-3198 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP3198(table: JumpTable): JumpTable {
  // BASEFEE - Get the base fee of the current block
  table[Op.BASEFEE] = makeOperation({
    execute: opBasefee,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
