/**
 * Byzantium Jump Table
 * Adds REVERT, STATICCALL, RETURNDATASIZE, RETURNDATACOPY
 */
import { Op } from '../constants'
import { opRevert } from '../instructions/control'
import { opReturndatacopy, opReturndatasize } from '../instructions/environment'
import {
  dynamicGasReturndatacopy,
  dynamicGasRevert,
  dynamicGasStaticcall,
} from '../instructions/gas'
import { opStaticcall } from '../instructions/system'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createTangerineWhistleJumpTable } from './tangerineWhistle'

/**
 * Create the Byzantium jump table
 * Builds on Tangerine Whistle, adding:
 * - REVERT (0xfd) - EIP-140
 * - STATICCALL (0xfa) - EIP-214
 * - RETURNDATASIZE (0x3d) - EIP-211
 * - RETURNDATACOPY (0x3e) - EIP-211
 */
export function createByzantiumJumpTable(): JumpTable {
  const table = createTangerineWhistleJumpTable()

  // REVERT - EIP-140
  table[Op.REVERT] = makeOperation({
    execute: opRevert,
    minStack: 2,
    maxStack: 1022,
    dynamicGas: dynamicGasRevert,
  })

  // STATICCALL - EIP-214
  table[Op.STATICCALL] = makeOperation({
    execute: opStaticcall,
    minStack: 6,
    maxStack: 1019,
    isAsync: true,
    dynamicGas: dynamicGasStaticcall,
  })

  // RETURNDATASIZE - EIP-211
  table[Op.RETURNDATASIZE] = makeOperation({
    execute: opReturndatasize,
    minStack: 0,
    maxStack: 1025,
  })

  // RETURNDATACOPY - EIP-211
  table[Op.RETURNDATACOPY] = makeOperation({
    execute: opReturndatacopy,
    minStack: 3,
    maxStack: 1021,
    dynamicGas: dynamicGasReturndatacopy,
  })

  return table
}
