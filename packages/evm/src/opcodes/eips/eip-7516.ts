/**
 * EIP-7516: BLOBBASEFEE opcode
 * Adds BLOBBASEFEE opcode to retrieve the blob base fee
 */
import { Op } from '../constants'
import { opBlobbasefee } from '../instructions/block'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-7516 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP7516(table: JumpTable): JumpTable {
  // BLOBBASEFEE - Get the blob base fee of the current block
  table[Op.BLOBBASEFEE] = makeOperation({
    execute: opBlobbasefee,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
