/**
 * Memory opcode handlers
 * MLOAD, MSTORE, MSTORE8, MSIZE, MCOPY
 */
import {
  BIGINT_0,
  BIGINT_32,
  BIGINT_255,
  bigIntToBytes,
  bytesToBigInt,
  setLengthLeft,
} from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * MLOAD - Load word from memory
 * Stack: [offset] -> [value]
 */
export const opMload: ExecuteFunc = (runState: RunState) => {
  const pos = runState.stack.pop()
  const word = runState.memory.read(Number(pos), 32, true)
  runState.stack.push(bytesToBigInt(word))
}

/**
 * MSTORE - Store word to memory
 * Stack: [offset, value] -> []
 */
export const opMstore: ExecuteFunc = (runState: RunState) => {
  const [offset, word] = runState.stack.popN(2)
  const buf = setLengthLeft(bigIntToBytes(word), 32)
  const offsetNum = Number(offset)
  runState.memory.write(offsetNum, 32, buf)
}

/**
 * MSTORE8 - Store single byte to memory
 * Stack: [offset, value] -> []
 */
export const opMstore8: ExecuteFunc = (runState: RunState) => {
  const [offset, byte] = runState.stack.popN(2)

  const buf = bigIntToBytes(byte & BIGINT_255)
  const offsetNum = Number(offset)
  runState.memory.write(offsetNum, 1, buf)
}

/**
 * MSIZE - Get size of active memory in bytes
 * Stack: [] -> [size]
 */
export const opMsize: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.memoryWordCount * BIGINT_32)
}

/**
 * MCOPY - Copy memory areas (EIP-5656)
 * Stack: [dst, src, length] -> []
 */
export const opMcopy: ExecuteFunc = (runState: RunState) => {
  const [dst, src, length] = runState.stack.popN(3)
  if (length !== BIGINT_0) {
    const data = runState.memory.read(Number(src), Number(length), true)
    runState.memory.write(Number(dst), Number(length), data)
  }
}

/**
 * Map of memory opcodes to their handlers
 */
export const memoryHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.MLOAD, opMload],
  [Op.MSTORE, opMstore],
  [Op.MSTORE8, opMstore8],
  [Op.MSIZE, opMsize],
  [Op.MCOPY, opMcopy],
])
