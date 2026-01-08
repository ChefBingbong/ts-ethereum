/**
 * EIP-7480: EOF - Data section access instructions
 * Adds DATALOAD, DATALOADN, DATASIZE, DATACOPY opcodes
 */
import { Op } from '../constants'
import {
  opDatacopy,
  opDataload,
  opDataloadn,
  opDatasize,
} from '../instructions/eof'
import type { JumpTable } from '../types'
import { makeOperation } from '../types'

/**
 * Enable EIP-7480 on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableEIP7480(table: JumpTable): JumpTable {
  // DATALOAD - Load 32 bytes from data section
  table[Op.DATALOAD] = makeOperation({
    execute: opDataload,
    minStack: 1,
    maxStack: 1024,
  })

  // DATALOADN - Load 32 bytes from data section with immediate offset
  table[Op.DATALOADN] = makeOperation({
    execute: opDataloadn,
    minStack: 0,
    maxStack: 1025,
  })

  // DATASIZE - Get size of data section
  table[Op.DATASIZE] = makeOperation({
    execute: opDatasize,
    minStack: 0,
    maxStack: 1025,
  })

  // DATACOPY - Copy data section to memory
  table[Op.DATACOPY] = makeOperation({
    execute: opDatacopy,
    minStack: 3,
    maxStack: 1021,
  })

  return table
}
