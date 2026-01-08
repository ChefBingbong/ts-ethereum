/**
 * EIP-4844: Shard Blob Transactions
 * Adds BLOBHASH opcode
 */
import { Op } from '../constants'
import { opBlobhash } from '../instructions/block'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-4844 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP4844(table: JumpTable): JumpTable {
  // BLOBHASH - Get versioned hash at given index
  table[Op.BLOBHASH] = makeOperation({
    execute: opBlobhash,
    minStack: 1,
    maxStack: 1024,
  })

  return table
}
