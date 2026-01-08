/**
 * EIP-7069: Revamped CALL instructions
 * Adds RETURNDATALOAD, EXTCALL, EXTDELEGATECALL, EXTSTATICCALL opcodes
 */
import { Op } from '../constants'
import {
  opExtcall,
  opExtdelegatecall,
  opExtstaticcall,
  opReturndataload,
} from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-7069 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP7069(table: JumpTable): JumpTable {
  // RETURNDATALOAD - Load return data
  table[Op.RETURNDATALOAD] = makeOperation({
    execute: opReturndataload,
    minStack: 1,
    maxStack: 1024,
  })

  // EXTCALL - External call
  table[Op.EXTCALL] = makeOperation({
    execute: opExtcall,
    minStack: 4,
    maxStack: 1021,
    isAsync: true,
  })

  // EXTDELEGATECALL - External delegate call
  table[Op.EXTDELEGATECALL] = makeOperation({
    execute: opExtdelegatecall,
    minStack: 3,
    maxStack: 1022,
    isAsync: true,
  })

  // EXTSTATICCALL - External static call
  table[Op.EXTSTATICCALL] = makeOperation({
    execute: opExtstaticcall,
    minStack: 3,
    maxStack: 1022,
    isAsync: true,
  })

  return table
}
