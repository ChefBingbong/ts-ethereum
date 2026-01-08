/**
 * Arithmetic opcode handlers
 * ADD, MUL, SUB, DIV, SDIV, MOD, SMOD, ADDMOD, MULMOD, EXP, SIGNEXTEND
 */
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  BIGINT_2EXP96,
  BIGINT_2EXP160,
  BIGINT_2EXP224,
  BIGINT_7,
  BIGINT_8,
  BIGINT_31,
  BIGINT_96,
  BIGINT_160,
  BIGINT_224,
  TWO_POW256,
} from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { exponentiation, fromTwos, mod, toTwos } from '../util'

/**
 * ADD - Addition operation
 * Stack: [a, b] -> [a + b]
 */
export const opAdd: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = mod(a + b, TWO_POW256)
  runState.stack.push(r)
}

/**
 * MUL - Multiplication operation
 * Stack: [a, b] -> [a * b]
 */
export const opMul: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = mod(a * b, TWO_POW256)
  runState.stack.push(r)
}

/**
 * SUB - Subtraction operation
 * Stack: [a, b] -> [a - b]
 */
export const opSub: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = mod(a - b, TWO_POW256)
  runState.stack.push(r)
}

/**
 * DIV - Integer division operation
 * Stack: [a, b] -> [a / b], returns 0 if b == 0
 */
export const opDiv: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  let r: bigint
  if (b === BIGINT_0) {
    r = BIGINT_0
  } else {
    r = mod(a / b, TWO_POW256)
  }
  runState.stack.push(r)
}

/**
 * SDIV - Signed integer division operation
 * Stack: [a, b] -> [a / b], returns 0 if b == 0
 */
export const opSdiv: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  let r: bigint
  if (b === BIGINT_0) {
    r = BIGINT_0
  } else {
    r = toTwos(fromTwos(a) / fromTwos(b))
  }
  runState.stack.push(r)
}

/**
 * MOD - Modulo operation
 * Stack: [a, b] -> [a % b], returns 0 if b == 0
 */
export const opMod: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  let r: bigint
  if (b === BIGINT_0) {
    r = b
  } else {
    r = mod(a, b)
  }
  runState.stack.push(r)
}

/**
 * SMOD - Signed modulo operation
 * Stack: [a, b] -> [a % b], returns 0 if b == 0
 */
export const opSmod: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  let r: bigint
  if (b === BIGINT_0) {
    r = b
  } else {
    r = fromTwos(a) % fromTwos(b)
  }
  runState.stack.push(toTwos(r))
}

/**
 * ADDMOD - Modular addition operation
 * Stack: [a, b, N] -> [(a + b) % N], returns 0 if N == 0
 */
export const opAddmod: ExecuteFunc = (runState: RunState) => {
  const [a, b, c] = runState.stack.popN(3)
  let r: bigint
  if (c === BIGINT_0) {
    r = BIGINT_0
  } else {
    r = mod(a + b, c)
  }
  runState.stack.push(r)
}

/**
 * MULMOD - Modular multiplication operation
 * Stack: [a, b, N] -> [(a * b) % N], returns 0 if N == 0
 */
export const opMulmod: ExecuteFunc = (runState: RunState) => {
  const [a, b, c] = runState.stack.popN(3)
  let r: bigint
  if (c === BIGINT_0) {
    r = BIGINT_0
  } else {
    r = mod(a * b, c)
  }
  runState.stack.push(r)
}

/**
 * EXP - Exponential operation
 * Stack: [base, exponent] -> [base ** exponent]
 * Optimized for common cases like 2^96, 2^160, 2^224
 */
export const opExp: ExecuteFunc = (runState: RunState) => {
  const [base, exponent] = runState.stack.popN(2)

  // Optimize for powers of 2 (common in address/uint calculations)
  if (base === BIGINT_2) {
    switch (exponent) {
      case BIGINT_96:
        runState.stack.push(BIGINT_2EXP96)
        return
      case BIGINT_160:
        runState.stack.push(BIGINT_2EXP160)
        return
      case BIGINT_224:
        runState.stack.push(BIGINT_2EXP224)
        return
    }
  }

  if (exponent === BIGINT_0) {
    runState.stack.push(BIGINT_1)
    return
  }

  if (base === BIGINT_0) {
    runState.stack.push(base)
    return
  }

  const r = exponentiation(base, exponent)
  runState.stack.push(r)
}

/**
 * SIGNEXTEND - Sign extend operation
 * Stack: [k, val] -> [sign-extended val]
 * Extends a k-byte value to 32 bytes preserving the sign bit
 */
export const opSignextend: ExecuteFunc = (runState: RunState) => {
  /* eslint-disable-next-line prefer-const */
  let [k, val] = runState.stack.popN(2)
  if (k < BIGINT_31) {
    const signBit = k * BIGINT_8 + BIGINT_7
    const mask = (BIGINT_1 << signBit) - BIGINT_1
    if ((val >> signBit) & BIGINT_1) {
      val = val | BigInt.asUintN(256, ~mask)
    } else {
      val = val & mask
    }
  }
  runState.stack.push(val)
}

/**
 * Map of arithmetic opcodes to their handlers
 */
export const arithmeticHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.ADD, opAdd],
  [Op.MUL, opMul],
  [Op.SUB, opSub],
  [Op.DIV, opDiv],
  [Op.SDIV, opSdiv],
  [Op.MOD, opMod],
  [Op.SMOD, opSmod],
  [Op.ADDMOD, opAddmod],
  [Op.MULMOD, opMulmod],
  [Op.EXP, opExp],
  [Op.SIGNEXTEND, opSignextend],
])
