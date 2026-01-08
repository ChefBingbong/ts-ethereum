/**
 * EIP-1153: Transient Storage
 * Adds TLOAD and TSTORE opcodes
 */
import { Op } from '../constants'
import { opTload, opTstore } from '../instructions/storage'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-1153 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP1153(table: JumpTable): JumpTable {
  // TLOAD - Load from transient storage
  table[Op.TLOAD] = makeOperation({
    execute: opTload,
    minStack: 1,
    maxStack: 1024,
  })

  // TSTORE - Store to transient storage
  table[Op.TSTORE] = makeOperation({
    execute: opTstore,
    minStack: 2,
    maxStack: 1022,
  })

  return table
}
