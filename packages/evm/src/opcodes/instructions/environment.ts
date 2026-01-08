/**
 * Environment opcode handlers
 * ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, CALLDATALOAD, CALLDATASIZE,
 * CALLDATACOPY, CODESIZE, CODECOPY, GASPRICE, EXTCODESIZE, EXTCODECOPY,
 * RETURNDATASIZE, RETURNDATACOPY, EXTCODEHASH
 */
import {
  BIGINT_0,
  BIGINT_8,
  bytesToBigInt,
  bytesToHex,
} from '@ts-ethereum/utils'
import { EOFBYTES, EOFHASH, isEOF } from '../../eof/util'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { createAddressFromStackBigInt, getDataSlice } from '../util'

/**
 * ADDRESS - Get address of currently executing account
 * Stack: [] -> [address]
 */
export const opAddress: ExecuteFunc = (runState: RunState) => {
  const address = bytesToBigInt(runState.interpreter.getAddress().bytes)
  runState.stack.push(address)
}

/**
 * BALANCE - Get balance of an account
 * Stack: [address] -> [balance]
 */
export const opBalance: ExecuteFunc = async (runState: RunState) => {
  const addressBigInt = runState.stack.pop()
  const address = createAddressFromStackBigInt(addressBigInt)
  const balance = await runState.interpreter.getExternalBalance(address)
  runState.stack.push(balance)
}

/**
 * ORIGIN - Get execution origination address
 * Stack: [] -> [address]
 */
export const opOrigin: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getTxOrigin())
}

/**
 * CALLER - Get caller address
 * Stack: [] -> [address]
 */
export const opCaller: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getCaller())
}

/**
 * CALLVALUE - Get deposited value by the call
 * Stack: [] -> [value]
 */
export const opCallvalue: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getCallValue())
}

/**
 * CALLDATALOAD - Load 32 bytes from input data
 * Stack: [offset] -> [data]
 */
export const opCalldataload: ExecuteFunc = (runState: RunState) => {
  const pos = runState.stack.pop()
  if (pos > runState.interpreter.getCallDataSize()) {
    runState.stack.push(BIGINT_0)
    return
  }

  const i = Number(pos)
  let loaded = runState.interpreter.getCallData().subarray(i, i + 32)
  loaded = loaded.length ? loaded : Uint8Array.from([0])
  let r = bytesToBigInt(loaded)
  if (loaded.length < 32) {
    r = r << (BIGINT_8 * BigInt(32 - loaded.length))
  }
  runState.stack.push(r)
}

/**
 * CALLDATASIZE - Get size of input data
 * Stack: [] -> [size]
 */
export const opCalldatasize: ExecuteFunc = (runState: RunState) => {
  const r = runState.interpreter.getCallDataSize()
  runState.stack.push(r)
}

/**
 * CALLDATACOPY - Copy input data to memory
 * Stack: [memOffset, dataOffset, length] -> []
 */
export const opCalldatacopy: ExecuteFunc = (runState: RunState) => {
  const [memOffset, dataOffset, dataLength] = runState.stack.popN(3)

  if (dataLength !== BIGINT_0) {
    const data = getDataSlice(
      runState.interpreter.getCallData(),
      dataOffset,
      dataLength,
    )
    const memOffsetNum = Number(memOffset)
    const dataLengthNum = Number(dataLength)
    runState.memory.write(memOffsetNum, dataLengthNum, data)
  }
}

/**
 * CODESIZE - Get size of code running in current environment
 * Stack: [] -> [size]
 */
export const opCodesize: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getCodeSize())
}

/**
 * CODECOPY - Copy code running to memory
 * Stack: [memOffset, codeOffset, length] -> []
 */
export const opCodecopy: ExecuteFunc = (runState: RunState) => {
  const [memOffset, codeOffset, dataLength] = runState.stack.popN(3)

  if (dataLength !== BIGINT_0) {
    const data = getDataSlice(
      runState.interpreter.getCode(),
      codeOffset,
      dataLength,
    )
    const memOffsetNum = Number(memOffset)
    const lengthNum = Number(dataLength)
    runState.memory.write(memOffsetNum, lengthNum, data)
  }
}

/**
 * GASPRICE - Get price of gas in current environment
 * Stack: [] -> [gasPrice]
 */
export const opGasprice: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getTxGasPrice())
}

/**
 * EXTCODESIZE - Get size of an account's code
 * Stack: [address] -> [size]
 */
export const opExtcodesize: ExecuteFunc = async (runState: RunState) => {
  const addressBigInt = runState.stack.pop()
  const address = createAddressFromStackBigInt(addressBigInt)
  // EOF check
  const code = await runState.stateManager.getCode(address)
  if (isEOF(code)) {
    // In legacy code, the target code is treated as to be "EOFBYTES" code
    runState.stack.push(BigInt(EOFBYTES.length))
    return
  }

  const size = BigInt(code.length)
  runState.stack.push(size)
}

/**
 * EXTCODECOPY - Copy an account's code to memory
 * Stack: [address, memOffset, codeOffset, length] -> []
 */
export const opExtcodecopy: ExecuteFunc = async (runState: RunState) => {
  const [addressBigInt, memOffset, codeOffset, dataLength] =
    runState.stack.popN(4)

  if (dataLength !== BIGINT_0) {
    const address = createAddressFromStackBigInt(addressBigInt)
    let code = await runState.stateManager.getCode(address)

    if (isEOF(code)) {
      // In legacy code, the target code is treated as to be "EOFBYTES" code
      code = EOFBYTES
    }

    const data = getDataSlice(code, codeOffset, dataLength)
    const memOffsetNum = Number(memOffset)
    const lengthNum = Number(dataLength)
    runState.memory.write(memOffsetNum, lengthNum, data)
  }
}

/**
 * RETURNDATASIZE - Get size of return data buffer
 * Stack: [] -> [size]
 */
export const opReturndatasize: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getReturnDataSize())
}

/**
 * RETURNDATACOPY - Copy return data to memory
 * Stack: [memOffset, dataOffset, length] -> []
 */
export const opReturndatacopy: ExecuteFunc = (runState: RunState) => {
  const [memOffset, returnDataOffset, dataLength] = runState.stack.popN(3)

  if (dataLength !== BIGINT_0) {
    const data = getDataSlice(
      runState.interpreter.getReturnData(),
      returnDataOffset,
      dataLength,
    )
    const memOffsetNum = Number(memOffset)
    const lengthNum = Number(dataLength)
    runState.memory.write(memOffsetNum, lengthNum, data)
  }
}

/**
 * EXTCODEHASH - Get hash of an account's code
 * Stack: [address] -> [hash]
 */
export const opExtcodehash: ExecuteFunc = async (runState: RunState) => {
  const addressBigInt = runState.stack.pop()
  const address = createAddressFromStackBigInt(addressBigInt)

  // EOF check
  const code = await runState.stateManager.getCode(address)
  if (isEOF(code)) {
    // In legacy code, the target code is treated as to be "EOFBYTES" code
    // Therefore, push the hash of EOFBYTES to the stack
    runState.stack.push(bytesToBigInt(EOFHASH))
    return
  }

  const account = await runState.stateManager.getAccount(address)
  if (!account || account.isEmpty()) {
    runState.stack.push(BIGINT_0)
    return
  }

  runState.stack.push(BigInt(bytesToHex(account.codeHash)))
}

/**
 * Map of environment opcodes to their handlers
 */
export const environmentHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.ADDRESS, opAddress],
  [Op.BALANCE, opBalance],
  [Op.ORIGIN, opOrigin],
  [Op.CALLER, opCaller],
  [Op.CALLVALUE, opCallvalue],
  [Op.CALLDATALOAD, opCalldataload],
  [Op.CALLDATASIZE, opCalldatasize],
  [Op.CALLDATACOPY, opCalldatacopy],
  [Op.CODESIZE, opCodesize],
  [Op.CODECOPY, opCodecopy],
  [Op.GASPRICE, opGasprice],
  [Op.EXTCODESIZE, opExtcodesize],
  [Op.EXTCODECOPY, opExtcodecopy],
  [Op.RETURNDATASIZE, opReturndatasize],
  [Op.RETURNDATACOPY, opReturndatacopy],
  [Op.EXTCODEHASH, opExtcodehash],
])
