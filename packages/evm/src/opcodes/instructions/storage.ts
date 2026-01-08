/**
 * Storage opcode handlers
 * SLOAD, SSTORE, TLOAD, TSTORE
 */
import {
  BIGINT_0,
  bigIntToBytes,
  bytesToBigInt,
  setLengthLeft,
} from '@ts-ethereum/utils'
import { EVMError } from '../../errors'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { trap } from '../util'

/**
 * SLOAD - Load word from storage
 * Stack: [key] -> [value]
 */
export const opSload: ExecuteFunc = async (runState: RunState) => {
  const key = runState.stack.pop()
  const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
  const value = await runState.interpreter.storageLoad(keyBuf)
  const valueBigInt = value.length ? bytesToBigInt(value) : BIGINT_0
  runState.stack.push(valueBigInt)
}

/**
 * SSTORE - Store word to storage
 * Stack: [key, value] -> []
 */
export const opSstore: ExecuteFunc = async (runState: RunState) => {
  const [key, val] = runState.stack.popN(2)

  const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
  // NOTE: this should be the shortest representation
  let value: Uint8Array
  if (val === BIGINT_0) {
    value = Uint8Array.from([])
  } else {
    value = bigIntToBytes(val)
  }

  await runState.interpreter.storageStore(keyBuf, value)
}

/**
 * TLOAD - Load word from transient storage (EIP-1153)
 * Stack: [key] -> [value]
 */
export const opTload: ExecuteFunc = (runState: RunState) => {
  const key = runState.stack.pop()
  const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
  const value = runState.interpreter.transientStorageLoad(keyBuf)
  const valueBN = value.length ? bytesToBigInt(value) : BIGINT_0
  runState.stack.push(valueBN)
}

/**
 * TSTORE - Store word to transient storage (EIP-1153)
 * Stack: [key, value] -> []
 */
export const opTstore: ExecuteFunc = (runState: RunState) => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }
  const [key, val] = runState.stack.popN(2)

  const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
  // NOTE: this should be the shortest representation
  let value: Uint8Array
  if (val === BIGINT_0) {
    value = Uint8Array.from([])
  } else {
    value = bigIntToBytes(val)
  }

  runState.interpreter.transientStorageStore(keyBuf, value)
}

/**
 * Map of storage opcodes to their handlers
 */
export const storageHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.SLOAD, opSload],
  [Op.SSTORE, opSstore],
  [Op.TLOAD, opTload],
  [Op.TSTORE, opTstore],
])
