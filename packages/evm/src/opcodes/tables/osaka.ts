/**
 * Osaka (EOF) Jump Table
 * Adds all EOF opcodes and CLZ (EIP-7939)
 */
import { Op } from '../constants'
import { opClz } from '../instructions/bitwise'
import {
  opCallf,
  opDatacopy,
  opDataload,
  opDataloadn,
  opDatasize,
  opDupn,
  opEofcreate,
  opExchange,
  opExtcall,
  opExtdelegatecall,
  opExtstaticcall,
  opJumpf,
  opRetf,
  opReturncontract,
  opReturndataload,
  opRjump,
  opRjumpi,
  opRjumpv,
  opSwapn,
} from '../instructions/eof'
import {
  dynamicGasDatacopy,
  dynamicGasEofcreate,
  dynamicGasExtcall,
  dynamicGasExtdelegatecall,
  dynamicGasExtstaticcall,
  dynamicGasReturncontract,
} from '../instructions/gas'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'
import { createCancunJumpTable } from './cancun'

/**
 * Create the Osaka jump table
 * Builds on Cancun, adding EOF opcodes:
 * - RJUMP, RJUMPI, RJUMPV (EIP-4200)
 * - CALLF, RETF (EIP-4750)
 * - JUMPF (EIP-6206)
 * - DUPN, SWAPN, EXCHANGE (EIP-663)
 * - DATALOAD, DATALOADN, DATASIZE, DATACOPY (EIP-7480)
 * - RETURNDATALOAD, EXTCALL, EXTDELEGATECALL, EXTSTATICCALL (EIP-7069)
 * - EOFCREATE, RETURNCONTRACT (EIP-7620)
 * - CLZ (EIP-7939)
 */
export function createOsakaJumpTable(): JumpTable {
  const table = createCancunJumpTable()

  // EIP-4200 - Relative jumps
  table[Op.RJUMP] = makeOperation({
    execute: opRjump,
    minStack: 0,
    maxStack: 1024,
  })

  table[Op.RJUMPI] = makeOperation({
    execute: opRjumpi,
    minStack: 1,
    maxStack: 1023,
  })

  table[Op.RJUMPV] = makeOperation({
    execute: opRjumpv,
    minStack: 1,
    maxStack: 1023,
  })

  // EIP-4750 - Functions
  table[Op.CALLF] = makeOperation({
    execute: opCallf,
    minStack: 0,
    maxStack: 1024,
  })

  table[Op.RETF] = makeOperation({
    execute: opRetf,
    minStack: 0,
    maxStack: 1024,
  })

  // EIP-6206 - JUMPF
  table[Op.JUMPF] = makeOperation({
    execute: opJumpf,
    minStack: 0,
    maxStack: 1024,
  })

  // EIP-663 - Stack manipulation
  table[Op.DUPN] = makeOperation({
    execute: opDupn,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.SWAPN] = makeOperation({
    execute: opSwapn,
    minStack: 2,
    maxStack: 1024,
  })

  table[Op.EXCHANGE] = makeOperation({
    execute: opExchange,
    minStack: 3,
    maxStack: 1024,
  })

  // EIP-7480 - Data section access
  table[Op.DATALOAD] = makeOperation({
    execute: opDataload,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.DATALOADN] = makeOperation({
    execute: opDataloadn,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.DATASIZE] = makeOperation({
    execute: opDatasize,
    minStack: 0,
    maxStack: 1025,
  })

  table[Op.DATACOPY] = makeOperation({
    execute: opDatacopy,
    minStack: 3,
    maxStack: 1021,
    dynamicGas: dynamicGasDatacopy,
  })

  // EIP-7069 - EOF calls
  table[Op.RETURNDATALOAD] = makeOperation({
    execute: opReturndataload,
    minStack: 1,
    maxStack: 1024,
  })

  table[Op.EXTCALL] = makeOperation({
    execute: opExtcall,
    minStack: 4,
    maxStack: 1021,
    isAsync: true,
    dynamicGas: dynamicGasExtcall,
  })

  table[Op.EXTDELEGATECALL] = makeOperation({
    execute: opExtdelegatecall,
    minStack: 3,
    maxStack: 1022,
    isAsync: true,
    dynamicGas: dynamicGasExtdelegatecall,
  })

  table[Op.EXTSTATICCALL] = makeOperation({
    execute: opExtstaticcall,
    minStack: 3,
    maxStack: 1022,
    isAsync: true,
    dynamicGas: dynamicGasExtstaticcall,
  })

  // EIP-7620 - EOF create
  table[Op.EOFCREATE] = makeOperation({
    execute: opEofcreate,
    minStack: 4,
    maxStack: 1021,
    isAsync: true,
    dynamicGas: dynamicGasEofcreate,
  })

  table[Op.RETURNCONTRACT] = makeOperation({
    execute: opReturncontract,
    minStack: 2,
    maxStack: 1022,
    isAsync: true,
    dynamicGas: dynamicGasReturncontract,
  })

  // EIP-7939 - Count leading zeros
  table[Op.CLZ] = makeOperation({
    execute: opClz,
    minStack: 1,
    maxStack: 1024,
  })

  return table
}
