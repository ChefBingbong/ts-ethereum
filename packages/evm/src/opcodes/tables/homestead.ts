/**
 * Homestead Jump Table
 * Adds DELEGATECALL (EIP-7)
 */
import { Op } from '../constants'
import { dynamicGasDelegatecall } from '../instructions/gas'
import { opDelegatecall } from '../instructions/system'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createFrontierJumpTable } from './frontier'

/**
 * Create the Homestead jump table
 * Builds on Frontier, adding:
 * - DELEGATECALL (0xf4) - EIP-7
 */
export function createHomesteadJumpTable(): JumpTable {
  const table = createFrontierJumpTable()

  // DELEGATECALL - EIP-7
  table[Op.DELEGATECALL] = makeOperation({
    execute: opDelegatecall,
    minStack: 6,
    maxStack: 1019,
    isAsync: true,
    dynamicGas: dynamicGasDelegatecall,
  })

  return table
}
