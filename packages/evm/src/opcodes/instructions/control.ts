/**
 * Control flow opcode handlers
 * STOP, JUMP, JUMPI, PC, GAS, JUMPDEST, RETURN, REVERT
 */
import { BIGINT_0 } from '@ts-ethereum/utils'
import { EVMError } from '../../errors'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'
import { describeLocation, jumpIsValid, trap } from '../util'

/**
 * STOP - Halt execution
 * Stack: [] -> []
 */
export const opStop: ExecuteFunc = () => {
  trap(EVMError.errorMessages.STOP)
}

/**
 * JUMP - Alter the program counter
 * Stack: [dest] -> []
 */
export const opJump: ExecuteFunc = (runState: RunState) => {
  const dest = runState.stack.pop()
  if (dest > runState.interpreter.getCodeSize()) {
    trap(
      EVMError.errorMessages.INVALID_JUMP + ' at ' + describeLocation(runState),
    )
  }

  const destNum = Number(dest)

  if (!jumpIsValid(runState, destNum)) {
    trap(
      EVMError.errorMessages.INVALID_JUMP + ' at ' + describeLocation(runState),
    )
  }

  runState.programCounter = destNum
}

/**
 * JUMPI - Conditionally alter the program counter
 * Stack: [dest, cond] -> []
 */
export const opJumpi: ExecuteFunc = (runState: RunState) => {
  const [dest, cond] = runState.stack.popN(2)
  if (cond !== BIGINT_0) {
    if (dest > runState.interpreter.getCodeSize()) {
      trap(
        EVMError.errorMessages.INVALID_JUMP +
          ' at ' +
          describeLocation(runState),
      )
    }

    const destNum = Number(dest)

    if (!jumpIsValid(runState, destNum)) {
      trap(
        EVMError.errorMessages.INVALID_JUMP +
          ' at ' +
          describeLocation(runState),
      )
    }

    runState.programCounter = destNum
  }
}

/**
 * PC - Get the value of the program counter prior to increment
 * Stack: [] -> [pc]
 */
export const opPc: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(BigInt(runState.programCounter - 1))
}

/**
 * GAS - Get the amount of available gas
 * Stack: [] -> [gas]
 */
export const opGas: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(runState.interpreter.getGasLeft())
}

/**
 * JUMPDEST - Mark a valid destination for jumps
 * Stack: [] -> []
 */
export const opJumpdest: ExecuteFunc = () => {
  // No-op - just marks a valid jump destination
}

/**
 * RETURN - Halt execution returning output data
 * Stack: [offset, length] -> []
 */
export const opReturn: ExecuteFunc = (runState: RunState) => {
  const [offset, length] = runState.stack.popN(2)
  let returnData = new Uint8Array(0)
  if (length !== BIGINT_0) {
    returnData = runState.memory.read(Number(offset), Number(length))
  }
  runState.interpreter.finish(returnData)
}

/**
 * REVERT - Halt execution reverting state changes
 * Stack: [offset, length] -> []
 */
export const opRevert: ExecuteFunc = (runState: RunState) => {
  const [offset, length] = runState.stack.popN(2)
  let returnData = new Uint8Array(0)
  if (length !== BIGINT_0) {
    returnData = runState.memory.read(Number(offset), Number(length))
  }
  runState.interpreter.revert(returnData)
}

/**
 * INVALID - Designated invalid instruction
 * Stack: [] -> []
 * Always throws
 */
export const opInvalid: ExecuteFunc = () => {
  trap(EVMError.errorMessages.INVALID_OPCODE)
}

/**
 * Map of control opcodes to their handlers
 */
export const controlHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.STOP, opStop],
  [Op.JUMP, opJump],
  [Op.JUMPI, opJumpi],
  [Op.PC, opPc],
  [Op.GAS, opGas],
  [Op.JUMPDEST, opJumpdest],
  [Op.RETURN, opReturn],
  [Op.REVERT, opRevert],
  [Op.INVALID, opInvalid],
])
