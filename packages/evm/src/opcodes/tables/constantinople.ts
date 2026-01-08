/**
 * Constantinople Jump Table
 * Adds SHL, SHR, SAR, EXTCODEHASH, CREATE2
 */
import { Op } from '../constants'
import { opSar, opShl, opShr } from '../instructions/bitwise'
import { opExtcodehash } from '../instructions/environment'
import { dynamicGasCreate2, dynamicGasExtcodehash } from '../instructions/gas'
import { opCreate2 } from '../instructions/system'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createByzantiumJumpTable } from './byzantium'

/**
 * Create the Constantinople jump table
 * Builds on Byzantium, adding:
 * - SHL (0x1b) - EIP-145
 * - SHR (0x1c) - EIP-145
 * - SAR (0x1d) - EIP-145
 * - EXTCODEHASH (0x3f) - EIP-1052
 * - CREATE2 (0xf5) - EIP-1014
 */
export function createConstantinopleJumpTable(): JumpTable {
  const table = createByzantiumJumpTable()

  // SHL - EIP-145 Bitwise shifting
  table[Op.SHL] = makeOperation({
    execute: opShl,
    minStack: 2,
    maxStack: 1023,
  })

  // SHR - EIP-145 Bitwise shifting
  table[Op.SHR] = makeOperation({
    execute: opShr,
    minStack: 2,
    maxStack: 1023,
  })

  // SAR - EIP-145 Bitwise shifting
  table[Op.SAR] = makeOperation({
    execute: opSar,
    minStack: 2,
    maxStack: 1023,
  })

  // EXTCODEHASH - EIP-1052
  table[Op.EXTCODEHASH] = makeOperation({
    execute: opExtcodehash,
    minStack: 1,
    maxStack: 1024,
    isAsync: true,
    dynamicGas: dynamicGasExtcodehash,
  })

  // CREATE2 - EIP-1014
  table[Op.CREATE2] = makeOperation({
    execute: opCreate2,
    minStack: 4,
    maxStack: 1021,
    isAsync: true,
    dynamicGas: dynamicGasCreate2,
  })

  return table
}
