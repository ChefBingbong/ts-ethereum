/**
 * Bitwise opcode handlers
 * AND, OR, XOR, NOT, BYTE, SHL, SHR, SAR, CLZ
 */
import {
  BIGINT_0,
  BIGINT_8,
  BIGINT_31,
  BIGINT_32,
  BIGINT_255,
  BIGINT_256,
  MAX_INTEGER_BIGINT,
} from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * AND - Bitwise AND operation
 * Stack: [a, b] -> [a & b]
 */
export const opAnd: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a & b
  runState.stack.push(r)
}

/**
 * OR - Bitwise OR operation
 * Stack: [a, b] -> [a | b]
 */
export const opOr: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a | b
  runState.stack.push(r)
}

/**
 * XOR - Bitwise XOR operation
 * Stack: [a, b] -> [a ^ b]
 */
export const opXor: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a ^ b
  runState.stack.push(r)
}

/**
 * NOT - Bitwise NOT operation
 * Stack: [a] -> [~a]
 */
export const opNot: ExecuteFunc = (runState: RunState) => {
  const a = runState.stack.pop()
  const r = BigInt.asUintN(256, ~a)
  runState.stack.push(r)
}

/**
 * BYTE - Retrieve single byte from word
 * Stack: [pos, word] -> [byte at pos]
 * Returns 0 if pos >= 32
 */
export const opByte: ExecuteFunc = (runState: RunState) => {
  const [pos, word] = runState.stack.popN(2)
  if (pos > BIGINT_32) {
    runState.stack.push(BIGINT_0)
    return
  }

  const r = (word >> ((BIGINT_31 - pos) * BIGINT_8)) & BIGINT_255
  runState.stack.push(r)
}

/**
 * SHL - Shift left operation (EIP-145)
 * Stack: [shift, value] -> [value << shift]
 * Returns 0 if shift >= 256
 */
export const opShl: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  if (a > BIGINT_256) {
    runState.stack.push(BIGINT_0)
    return
  }

  const r = (b << a) & MAX_INTEGER_BIGINT
  runState.stack.push(r)
}

/**
 * SHR - Logical shift right operation (EIP-145)
 * Stack: [shift, value] -> [value >> shift]
 * Returns 0 if shift >= 256
 */
export const opShr: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  if (a > 256) {
    runState.stack.push(BIGINT_0)
    return
  }

  const r = b >> a
  runState.stack.push(r)
}

/**
 * SAR - Arithmetic shift right operation (EIP-145)
 * Stack: [shift, value] -> [value >>> shift]
 * Preserves sign bit when shifting
 */
export const opSar: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)

  let r: bigint
  const bComp = BigInt.asIntN(256, b)
  const isSigned = bComp < 0
  if (a > 256) {
    if (isSigned) {
      r = MAX_INTEGER_BIGINT
    } else {
      r = BIGINT_0
    }
    runState.stack.push(r)
    return
  }

  const c = b >> a
  if (isSigned) {
    const shiftedOutWidth = BIGINT_255 - a
    const mask = (MAX_INTEGER_BIGINT >> shiftedOutWidth) << shiftedOutWidth
    r = c | mask
  } else {
    r = c
  }
  runState.stack.push(r)
}

/**
 * CLZ - Count leading zeros (EIP-7939)
 * Stack: [x] -> [leading zero count]
 * Returns 256 if x == 0
 */
export const opClz: ExecuteFunc = (runState: RunState) => {
  const x = runState.stack.pop()

  // If x is zero, return 256
  if (x === BIGINT_0) {
    runState.stack.push(BIGINT_256)
    return
  }

  // toString(2) yields a binary string with no leading zeros.
  // So 256 - binaryStr.length equals the leading-zero count.
  const binaryStr = x.toString(2)

  const leadingZeros = 256 - binaryStr.length
  runState.stack.push(BigInt(leadingZeros))
}

/**
 * Map of bitwise opcodes to their handlers
 */
export const bitwiseHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.AND, opAnd],
  [Op.OR, opOr],
  [Op.XOR, opXor],
  [Op.NOT, opNot],
  [Op.BYTE, opByte],
  [Op.SHL, opShl],
  [Op.SHR, opShr],
  [Op.SAR, opSar],
  [Op.CLZ, opClz],
])
