/**
 * Istanbul Jump Table
 * Adds CHAINID, SELFBALANCE
 */
import { Op } from '../constants'
import { opChainid, opSelfbalance } from '../instructions/block'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createConstantinopleJumpTable } from './constantinople'

/**
 * Create the Istanbul jump table
 * Builds on Constantinople, adding:
 * - CHAINID (0x46) - EIP-1344
 * - SELFBALANCE (0x47) - EIP-1884
 */
export function createIstanbulJumpTable(): JumpTable {
  const table = createConstantinopleJumpTable()

  // CHAINID - EIP-1344
  table[Op.CHAINID] = makeOperation({
    execute: opChainid,
    minStack: 0,
    maxStack: 1025,
  })

  // SELFBALANCE - EIP-1884
  table[Op.SELFBALANCE] = makeOperation({
    execute: opSelfbalance,
    minStack: 0,
    maxStack: 1025,
  })

  return table
}
