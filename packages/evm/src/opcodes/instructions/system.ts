/**
 * System opcode handlers
 * CREATE, CREATE2, CALL, CALLCODE, DELEGATECALL, STATICCALL, SELFDESTRUCT
 */
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { BIGINT_0, bigIntToBytes, setLengthLeft } from '@ts-ethereum/utils'
import { isEOF } from '../../eof/util'
import { EVMError } from '../../errors'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { createAddressFromStackBigInt, trap, writeCallOutput } from '../util'

/**
 * CREATE - Create a new account with associated code
 * Stack: [value, offset, length] -> [address]
 */
export const opCreate: ExecuteFunc = async (
  runState: RunState,
  common: HardforkManager,
) => {
  const [value, offset, length] = runState.stack.popN(3)

  const hardfork = runState.interpreter.fork
  if (
    common.isEIPActiveAtHardfork(3860, hardfork) &&
    length >
      Number(
        common.getParamAtHardfork(
          'maxInitCodeSize',
          common.getHardforkForEIP(3860) ?? hardfork,
        )!,
      ) &&
    !runState.interpreter._evm.allowUnlimitedInitCodeSize
  ) {
    trap(EVMError.errorMessages.INITCODE_SIZE_VIOLATION)
  }

  const gasLimit = runState.messageGasLimit!
  runState.messageGasLimit = undefined

  let data = new Uint8Array(0)
  if (length !== BIGINT_0) {
    data = runState.memory.read(Number(offset), Number(length), true)
  }

  if (isEOF(data)) {
    // Legacy cannot deploy EOF code
    runState.stack.push(BIGINT_0)
    return
  }

  const ret = await runState.interpreter.create(gasLimit, value, data)
  runState.stack.push(ret)
}

/**
 * CREATE2 - Create a new account with deterministic address
 * Stack: [value, offset, length, salt] -> [address]
 */
export const opCreate2: ExecuteFunc = async (
  runState: RunState,
  common: HardforkManager,
) => {
  if (runState.interpreter.isStatic()) {
    trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
  }

  const [value, offset, length, salt] = runState.stack.popN(4)

  const hardfork = runState.interpreter.fork
  if (
    common.isEIPActiveAtHardfork(3860, hardfork) &&
    length >
      Number(
        common.getParamAtHardfork(
          'maxInitCodeSize',
          common.getHardforkForEIP(3860) ?? hardfork,
        )!,
      ) &&
    !runState.interpreter._evm.allowUnlimitedInitCodeSize
  ) {
    trap(EVMError.errorMessages.INITCODE_SIZE_VIOLATION)
  }

  const gasLimit = runState.messageGasLimit!
  runState.messageGasLimit = undefined

  let data = new Uint8Array(0)
  if (length !== BIGINT_0) {
    data = runState.memory.read(Number(offset), Number(length), true)
  }

  if (isEOF(data)) {
    // Legacy cannot deploy EOF code
    runState.stack.push(BIGINT_0)
    return
  }

  const ret = await runState.interpreter.create2(
    gasLimit,
    value,
    data,
    setLengthLeft(bigIntToBytes(salt), 32),
  )
  runState.stack.push(ret)
}

/**
 * CALL - Message-call into an account
 * Stack: [gas, address, value, argsOffset, argsLength, retOffset, retLength] -> [success]
 */
export const opCall: ExecuteFunc = async (
  runState: RunState,
  common: HardforkManager,
) => {
  const [
    _currentGasLimit,
    toAddr,
    value,
    inOffset,
    inLength,
    outOffset,
    outLength,
  ] = runState.stack.popN(7)
  const toAddress = createAddressFromStackBigInt(toAddr)

  let data = new Uint8Array(0)
  if (inLength !== BIGINT_0) {
    data = runState.memory.read(Number(inOffset), Number(inLength), true)
  }

  let gasLimit = runState.messageGasLimit!
  if (value !== BIGINT_0) {
    const hardfork = runState.interpreter.fork
    const callStipend = common.getParamAtHardfork('callStipendGas', hardfork)!
    runState.interpreter.addStipend(callStipend)
    gasLimit += callStipend
  }

  runState.messageGasLimit = undefined

  const ret = await runState.interpreter.call(gasLimit, toAddress, value, data)
  // Write return data to memory
  writeCallOutput(runState, outOffset, outLength)
  runState.stack.push(ret)
}

/**
 * CALLCODE - Message-call with alternative account's code
 * Stack: [gas, address, value, argsOffset, argsLength, retOffset, retLength] -> [success]
 */
export const opCallcode: ExecuteFunc = async (
  runState: RunState,
  common: HardforkManager,
) => {
  const [
    _currentGasLimit,
    toAddr,
    value,
    inOffset,
    inLength,
    outOffset,
    outLength,
  ] = runState.stack.popN(7)
  const toAddress = createAddressFromStackBigInt(toAddr)

  let gasLimit = runState.messageGasLimit!
  if (value !== BIGINT_0) {
    const hardfork = runState.interpreter.fork
    const callStipend = common.getParamAtHardfork('callStipendGas', hardfork)!
    runState.interpreter.addStipend(callStipend)
    gasLimit += callStipend
  }

  runState.messageGasLimit = undefined

  let data = new Uint8Array(0)
  if (inLength !== BIGINT_0) {
    data = runState.memory.read(Number(inOffset), Number(inLength), true)
  }

  const ret = await runState.interpreter.callCode(
    gasLimit,
    toAddress,
    value,
    data,
  )
  // Write return data to memory
  writeCallOutput(runState, outOffset, outLength)
  runState.stack.push(ret)
}

/**
 * DELEGATECALL - Message-call with caller's context
 * Stack: [gas, address, argsOffset, argsLength, retOffset, retLength] -> [success]
 */
export const opDelegatecall: ExecuteFunc = async (runState: RunState) => {
  const value = runState.interpreter.getCallValue()
  const [_currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
    runState.stack.popN(6)
  const toAddress = createAddressFromStackBigInt(toAddr)

  let data = new Uint8Array(0)
  if (inLength !== BIGINT_0) {
    data = runState.memory.read(Number(inOffset), Number(inLength), true)
  }

  const gasLimit = runState.messageGasLimit!
  runState.messageGasLimit = undefined

  const ret = await runState.interpreter.callDelegate(
    gasLimit,
    toAddress,
    value,
    data,
  )
  // Write return data to memory
  writeCallOutput(runState, outOffset, outLength)
  runState.stack.push(ret)
}

/**
 * STATICCALL - Static message-call (no state modifications)
 * Stack: [gas, address, argsOffset, argsLength, retOffset, retLength] -> [success]
 */
export const opStaticcall: ExecuteFunc = async (runState: RunState) => {
  const value = BIGINT_0
  const [_currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
    runState.stack.popN(6)
  const toAddress = createAddressFromStackBigInt(toAddr)

  const gasLimit = runState.messageGasLimit!
  runState.messageGasLimit = undefined

  let data = new Uint8Array(0)
  if (inLength !== BIGINT_0) {
    data = runState.memory.read(Number(inOffset), Number(inLength), true)
  }

  const ret = await runState.interpreter.callStatic(
    gasLimit,
    toAddress,
    value,
    data,
  )
  // Write return data to memory
  writeCallOutput(runState, outOffset, outLength)
  runState.stack.push(ret)
}

/**
 * SELFDESTRUCT - Destroy current account
 * Stack: [beneficiary] -> []
 */
export const opSelfdestruct: ExecuteFunc = async (runState: RunState) => {
  const selfdestructToAddressBigInt = runState.stack.pop()
  const selfdestructToAddress = createAddressFromStackBigInt(
    selfdestructToAddressBigInt,
  )
  return runState.interpreter.selfDestruct(selfdestructToAddress)
}

/**
 * Map of system opcodes to their handlers
 */
export const systemHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.CREATE, opCreate],
  [Op.CREATE2, opCreate2],
  [Op.CALL, opCall],
  [Op.CALLCODE, opCallcode],
  [Op.DELEGATECALL, opDelegatecall],
  [Op.STATICCALL, opStaticcall],
  [Op.SELFDESTRUCT, opSelfdestruct],
])
