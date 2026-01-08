/**
 * EOF (EVM Object Format) opcode handlers
 * DATALOAD, DATALOADN, DATASIZE, DATACOPY, RJUMP, RJUMPI, RJUMPV,
 * CALLF, RETF, JUMPF, DUPN, SWAPN, EXCHANGE, EOFCREATE, RETURNCONTRACT,
 * RETURNDATALOAD, EXTCALL, EXTDELEGATECALL, EXTSTATICCALL
 */
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_8,
  bigIntToBytes,
  bytesToBigInt,
  bytesToInt,
  concatBytes,
  setLengthLeft,
} from '@ts-ethereum/utils'
import { EOFContainer, EOFContainerMode } from '../../eof/container'
import { EOFErrorMessage } from '../../eof/errors'
import { isEOF } from '../../eof/util'
import { EVMError } from '../../errors'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { createAddressFromStackBigInt, getDataSlice, trap } from '../util'

/**
 * DATALOAD - Load 32 bytes from data section (EIP-7480)
 * Stack: [offset] -> [data]
 */
export const opDataload: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const pos = runState.stack.pop()
  if (pos > runState.env.eof!.container.body.dataSection.length) {
    runState.stack.push(BIGINT_0)
    return
  }

  const i = Number(pos)
  let loaded = runState.env.eof!.container.body.dataSection.subarray(i, i + 32)
  loaded = loaded.length ? loaded : Uint8Array.from([0])
  let r = bytesToBigInt(loaded)
  if (loaded.length < 32) {
    r = r << (BIGINT_8 * BigInt(32 - loaded.length))
  }
  runState.stack.push(r)
}

/**
 * DATALOADN - Load 32 bytes from data section with immediate offset (EIP-7480)
 * Stack: [] -> [data]
 */
export const opDataloadn: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const toLoad = Number(
    bytesToBigInt(
      runState.code.subarray(
        runState.programCounter,
        runState.programCounter + 2,
      ),
    ),
  )
  const data = bytesToBigInt(
    runState.env.eof!.container.body.dataSection.subarray(toLoad, toLoad + 32),
  )
  runState.stack.push(data)
  runState.programCounter += 2
}

/**
 * DATASIZE - Get size of data section (EIP-7480)
 * Stack: [] -> [size]
 */
export const opDatasize: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  runState.stack.push(
    BigInt(runState.env.eof!.container.body.dataSection.length),
  )
}

/**
 * DATACOPY - Copy data section to memory (EIP-7480)
 * Stack: [memOffset, offset, size] -> []
 */
export const opDatacopy: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const [memOffset, offset, size] = runState.stack.popN(3)
  if (size !== BIGINT_0) {
    const data = getDataSlice(
      runState.env.eof!.container.body.dataSection,
      offset,
      size,
    )
    const memOffsetNum = Number(memOffset)
    const dataLengthNum = Number(size)
    runState.memory.write(memOffsetNum, dataLengthNum, data)
  }
}

/**
 * RJUMP - Relative jump (EIP-4200)
 * Stack: [] -> []
 */
export const opRjump: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const code = runState.env.code
    const rjumpDest = new DataView(code.buffer).getInt16(
      runState.programCounter,
    )
    runState.programCounter += 2 + rjumpDest
  }
}

/**
 * RJUMPI - Conditional relative jump (EIP-4200)
 * Stack: [condition] -> []
 */
export const opRjumpi: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const cond = runState.stack.pop()
    if (cond > 0) {
      const code = runState.env.code
      const rjumpDest = new DataView(code.buffer).getInt16(
        runState.programCounter,
      )
      runState.programCounter += rjumpDest
    }
    runState.programCounter += 2
  }
}

/**
 * RJUMPV - Relative jump via jump table (EIP-4200)
 * Stack: [case] -> []
 */
export const opRjumpv: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const code = runState.env.code
    const jumptableEntries = code[runState.programCounter]
    const jumptableSize = (jumptableEntries + 1) * 2
    runState.programCounter += 1
    const jumptableCase = runState.stack.pop()
    if (jumptableCase <= jumptableEntries) {
      const rjumpDest = new DataView(code.buffer).getInt16(
        runState.programCounter + Number(jumptableCase) * 2,
      )
      runState.programCounter += jumptableSize + rjumpDest
    } else {
      runState.programCounter += jumptableSize
    }
  }
}

/**
 * CALLF - Call a function in another code section (EIP-4750)
 * Stack: [] -> []
 */
export const opCallf: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const sectionTarget = bytesToInt(
    runState.code.slice(runState.programCounter, runState.programCounter + 2),
  )
  const stackItems = runState.stack.length
  const typeSection =
    runState.env.eof!.container.body.typeSections[sectionTarget]
  if (stackItems > 1024 - typeSection.maxStackHeight + typeSection.inputs) {
    trap(EOFErrorMessage.STACK_OVERFLOW)
  }
  if (runState.env.eof!.eofRunState.returnStack.length >= 1024) {
    trap(EOFErrorMessage.RETURN_STACK_OVERFLOW)
  }
  runState.env.eof?.eofRunState.returnStack.push(runState.programCounter + 2)
  runState.programCounter =
    runState.env.eof!.container.header.getCodePosition(sectionTarget)
}

/**
 * RETF - Return from function (EIP-4750)
 * Stack: [] -> []
 */
export const opRetf: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const newPc = runState.env.eof!.eofRunState.returnStack.pop()
  if (newPc === undefined) {
    trap(EOFErrorMessage.RETF_NO_RETURN)
  }
  runState.programCounter = newPc!
}

/**
 * JUMPF - Jump to a function (tail call) (EIP-6206)
 * Stack: [] -> []
 */
export const opJumpf: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const sectionTarget = bytesToInt(
    runState.code.slice(runState.programCounter, runState.programCounter + 2),
  )
  const stackItems = runState.stack.length
  const typeSection =
    runState.env.eof!.container.body.typeSections[sectionTarget]
  if (stackItems > 1024 - typeSection.maxStackHeight + typeSection.inputs) {
    trap(EOFErrorMessage.STACK_OVERFLOW)
  }
  runState.programCounter =
    runState.env.eof!.container.header.getCodePosition(sectionTarget)
}

/**
 * DUPN - Duplicate Nth stack item with immediate (EIP-663)
 * Stack: [...] -> [..., item]
 */
export const opDupn: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const toDup =
    Number(
      bytesToBigInt(
        runState.code.subarray(
          runState.programCounter,
          runState.programCounter + 1,
        ),
      ),
    ) + 1
  runState.stack.dup(toDup)
  runState.programCounter++
}

/**
 * SWAPN - Swap top and Nth stack items with immediate (EIP-663)
 * Stack: [a, ..., b] -> [b, ..., a]
 */
export const opSwapn: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const toSwap =
    Number(
      bytesToBigInt(
        runState.code.subarray(
          runState.programCounter,
          runState.programCounter + 1,
        ),
      ),
    ) + 1
  runState.stack.swap(toSwap)
  runState.programCounter++
}

/**
 * EXCHANGE - Exchange two stack items (EIP-663)
 * Stack: [...] -> [...]
 */
export const opExchange: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const toExchange = Number(
    bytesToBigInt(
      runState.code.subarray(
        runState.programCounter,
        runState.programCounter + 1,
      ),
    ),
  )
  const n = (toExchange >> 4) + 1
  const m = (toExchange & 0x0f) + 1
  runState.stack.exchange(n, n + m)
  runState.programCounter++
}

/**
 * EOFCREATE - Create contract with EOF container (EIP-7620)
 * Stack: [value, salt, inputOffset, inputSize] -> [address]
 */
export const opEofcreate: ExecuteFunc = async (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    if (runState.interpreter.isStatic()) {
      trap(EVMError.errorMessages.STATIC_STATE_CHANGE)
    }
    const containerIndex = runState.env.code[runState.programCounter]
    const containerCode =
      runState.env.eof!.container.body.containerSections[containerIndex]
    const [value, salt, inputOffset, inputSize] = runState.stack.popN(4)
    const gasLimit = runState.messageGasLimit!
    runState.messageGasLimit = undefined

    let data = new Uint8Array(0)
    if (inputSize !== BIGINT_0) {
      data = runState.memory.read(Number(inputOffset), Number(inputSize), true)
    }

    runState.programCounter++

    const ret = await runState.interpreter.eofcreate(
      gasLimit,
      value,
      containerCode,
      setLengthLeft(bigIntToBytes(salt), 32),
      data,
    )
    runState.stack.push(ret)
  }
}

/**
 * RETURNCONTRACT - Return from init code with contract (EIP-7620)
 * Stack: [auxDataOffset, auxDataSize] -> []
 */
export const opReturncontract: ExecuteFunc = async (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const containerIndex = runState.env.code[runState.programCounter]
    const containerCode =
      runState.env.eof!.container.body.containerSections[containerIndex]
    const deployContainer = new EOFContainer(
      containerCode,
      EOFContainerMode.Initmode,
    )
    const [auxDataOffset, auxDataSize] = runState.stack.popN(2)

    let auxData = new Uint8Array(0)
    if (auxDataSize !== BIGINT_0) {
      auxData = runState.memory.read(Number(auxDataOffset), Number(auxDataSize))
    }

    const originalDataSize = deployContainer.header.dataSize
    const preDeployDataSectionSize = deployContainer.body.dataSection.length
    const actualSectionSize = preDeployDataSectionSize + Number(auxDataSize)

    if (actualSectionSize < originalDataSize) {
      trap(EOFErrorMessage.INVALID_RETURN_CONTRACT_DATA_SIZE)
    }

    if (actualSectionSize > 0xffff) {
      trap(EVMError.errorMessages.OUT_OF_GAS)
    }

    const newSize = setLengthLeft(bigIntToBytes(BigInt(actualSectionSize)), 2)
    const dataSizePtr = deployContainer.header.dataSizePtr
    containerCode[dataSizePtr] = newSize[0]
    containerCode[dataSizePtr + 1] = newSize[1]

    const returnContainer = concatBytes(containerCode, auxData)
    runState.interpreter.finish(returnContainer)
  }
}

/**
 * RETURNDATALOAD - Load return data (EIP-7069)
 * Stack: [offset] -> [data]
 */
export const opReturndataload: ExecuteFunc = (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  }
  const pos = runState.stack.pop()
  if (pos > runState.interpreter.getReturnDataSize()) {
    runState.stack.push(BIGINT_0)
    return
  }

  const i = Number(pos)
  let loaded = runState.interpreter.getReturnData().subarray(i, i + 32)
  loaded = loaded.length ? loaded : Uint8Array.from([0])
  let r = bytesToBigInt(loaded)
  if (loaded.length < 32) {
    r = r << (BIGINT_8 * BigInt(32 - loaded.length))
  }
  runState.stack.push(r)
}

/**
 * EXTCALL - External call (EIP-7069)
 * Stack: [address, inputOffset, inputLength, value] -> [success]
 */
export const opExtcall: ExecuteFunc = async (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const [toAddr, inOffset, inLength, value] = runState.stack.popN(4)
    const gasLimit = runState.messageGasLimit!
    runState.messageGasLimit = undefined

    if (gasLimit === -BIGINT_1) {
      runState.stack.push(BIGINT_1)
      runState.returnBytes = new Uint8Array(0)
      return
    }

    const toAddress = createAddressFromStackBigInt(toAddr)
    let data = new Uint8Array(0)
    if (inLength !== BIGINT_0) {
      data = runState.memory.read(Number(inOffset), Number(inLength), true)
    }

    const ret = await runState.interpreter.call(
      gasLimit,
      toAddress,
      value,
      data,
    )
    runState.stack.push(ret)
  }
}

/**
 * EXTDELEGATECALL - External delegate call (EIP-7069)
 * Stack: [address, inputOffset, inputLength] -> [success]
 */
export const opExtdelegatecall: ExecuteFunc = async (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const value = runState.interpreter.getCallValue()
    const [toAddr, inOffset, inLength] = runState.stack.popN(3)
    const gasLimit = runState.messageGasLimit!
    runState.messageGasLimit = undefined

    if (gasLimit === -BIGINT_1) {
      runState.stack.push(BIGINT_1)
      runState.returnBytes = new Uint8Array(0)
      return
    }

    const toAddress = createAddressFromStackBigInt(toAddr)
    const code = await runState.stateManager.getCode(toAddress)

    if (!isEOF(code)) {
      runState.stack.push(BIGINT_1)
      runState.returnBytes = new Uint8Array(0)
      return
    }

    let data = new Uint8Array(0)
    if (inLength !== BIGINT_0) {
      data = runState.memory.read(Number(inOffset), Number(inLength), true)
    }

    const ret = await runState.interpreter.callDelegate(
      gasLimit,
      toAddress,
      value,
      data,
    )
    runState.stack.push(ret)
  }
}

/**
 * EXTSTATICCALL - External static call (EIP-7069)
 * Stack: [address, inputOffset, inputLength] -> [success]
 */
export const opExtstaticcall: ExecuteFunc = async (runState: RunState) => {
  if (runState.env.eof === undefined) {
    trap(EVMError.errorMessages.INVALID_OPCODE)
  } else {
    const value = BIGINT_0
    const [toAddr, inOffset, inLength] = runState.stack.popN(3)
    const gasLimit = runState.messageGasLimit!
    runState.messageGasLimit = undefined

    if (gasLimit === -BIGINT_1) {
      runState.stack.push(BIGINT_1)
      runState.returnBytes = new Uint8Array(0)
      return
    }

    const toAddress = createAddressFromStackBigInt(toAddr)
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
    runState.stack.push(ret)
  }
}

/**
 * Map of EOF opcodes to their handlers
 */
export const eofHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.DATALOAD, opDataload],
  [Op.DATALOADN, opDataloadn],
  [Op.DATASIZE, opDatasize],
  [Op.DATACOPY, opDatacopy],
  [Op.RJUMP, opRjump],
  [Op.RJUMPI, opRjumpi],
  [Op.RJUMPV, opRjumpv],
  [Op.CALLF, opCallf],
  [Op.RETF, opRetf],
  [Op.JUMPF, opJumpf],
  [Op.DUPN, opDupn],
  [Op.SWAPN, opSwapn],
  [Op.EXCHANGE, opExchange],
  [Op.EOFCREATE, opEofcreate],
  [Op.RETURNCONTRACT, opReturncontract],
  [Op.RETURNDATALOAD, opReturndataload],
  [Op.EXTCALL, opExtcall],
  [Op.EXTDELEGATECALL, opExtdelegatecall],
  [Op.EXTSTATICCALL, opExtstaticcall],
])
