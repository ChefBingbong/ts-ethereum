/**
 * Comparison opcode handlers
 * LT, GT, SLT, SGT, EQ, ISZERO
 */
import { BIGINT_0, BIGINT_1 } from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { fromTwos } from '../util'

/**
 * LT - Less than comparison
 * Stack: [a, b] -> [a < b ? 1 : 0]
 */
export const opLt: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a < b ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * GT - Greater than comparison
 * Stack: [a, b] -> [a > b ? 1 : 0]
 */
export const opGt: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a > b ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * SLT - Signed less than comparison
 * Stack: [a, b] -> [signed(a) < signed(b) ? 1 : 0]
 */
export const opSlt: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = fromTwos(a) < fromTwos(b) ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * SGT - Signed greater than comparison
 * Stack: [a, b] -> [signed(a) > signed(b) ? 1 : 0]
 */
export const opSgt: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = fromTwos(a) > fromTwos(b) ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * EQ - Equality comparison
 * Stack: [a, b] -> [a == b ? 1 : 0]
 */
export const opEq: ExecuteFunc = (runState: RunState) => {
  const [a, b] = runState.stack.popN(2)
  const r = a === b ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * ISZERO - Simple not operator
 * Stack: [a] -> [a == 0 ? 1 : 0]
 */
export const opIszero: ExecuteFunc = (runState: RunState) => {
  const a = runState.stack.pop()
  const r = a === BIGINT_0 ? BIGINT_1 : BIGINT_0
  runState.stack.push(r)
}

/**
 * Map of comparison opcodes to their handlers
 */
export const comparisonHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.LT, opLt],
  [Op.GT, opGt],
  [Op.SLT, opSlt],
  [Op.SGT, opSgt],
  [Op.EQ, opEq],
  [Op.ISZERO, opIszero],
])
