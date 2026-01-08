/**
 * Stack opcode handlers
 * POP, PUSH0, PUSH1-PUSH32, DUP1-DUP16, SWAP1-SWAP16
 */
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { BIGINT_0, bytesToBigInt, setLengthRight } from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * POP - Remove item from stack
 * Stack: [a] -> []
 */
export const opPop: ExecuteFunc = (runState: RunState) => {
  runState.stack.pop()
}

/**
 * PUSH0 - Push zero onto stack (EIP-3855)
 * Stack: [] -> [0]
 */
export const opPush0: ExecuteFunc = (runState: RunState) => {
  runState.stack.push(BIGINT_0)
}

/**
 * PUSH - Push N bytes onto stack (PUSH1-PUSH32)
 * Stack: [] -> [value]
 * Note: This handler works for all PUSH opcodes (0x60-0x7f)
 */
export const opPush: ExecuteFunc = (
  runState: RunState,
  common: HardforkManager,
) => {
  const numToPush = runState.opCode - 0x5f
  const hardfork = runState.interpreter.fork
  if (
    (common.isEIPActiveAtHardfork(6800, hardfork) ||
      common.isEIPActiveAtHardfork(7864, hardfork)) &&
    runState.env.chargeCodeAccesses === true
  ) {
    const contract = runState.interpreter.getAddress()
    const startOffset = Math.min(
      runState.code.length,
      runState.programCounter + 1,
    )
    const endOffset = Math.min(
      runState.code.length,
      startOffset + numToPush - 1,
    )
    const statelessGas = runState.env.accessWitness!.readAccountCodeChunks(
      contract,
      startOffset,
      endOffset,
    )
    runState.interpreter.useGas(statelessGas, `PUSH`)
  }

  if (!runState.shouldDoJumpAnalysis) {
    runState.stack.push(runState.cachedPushes[runState.programCounter])
    runState.programCounter += numToPush
  } else {
    let loadedBytes = runState.code.subarray(
      runState.programCounter,
      runState.programCounter + numToPush,
    )
    if (loadedBytes.length < numToPush) {
      loadedBytes = setLengthRight(loadedBytes, numToPush)
    }

    runState.programCounter += numToPush
    runState.stack.push(bytesToBigInt(loadedBytes))
  }
}

/**
 * DUP - Duplicate Nth stack item (DUP1-DUP16)
 * Stack: [..., a] -> [..., a, a]
 * Note: This handler works for all DUP opcodes (0x80-0x8f)
 */
export const opDup: ExecuteFunc = (runState: RunState) => {
  const stackPos = runState.opCode - 0x7f
  runState.stack.dup(stackPos)
}

/**
 * SWAP - Exchange 1st and Nth stack items (SWAP1-SWAP16)
 * Stack: [a, ..., b] -> [b, ..., a]
 * Note: This handler works for all SWAP opcodes (0x90-0x9f)
 */
export const opSwap: ExecuteFunc = (runState: RunState) => {
  const stackPos = runState.opCode - 0x8f
  runState.stack.swap(stackPos)
}

/**
 * Map of stack opcodes to their handlers
 * Note: PUSH, DUP, and SWAP are special - they handle multiple opcodes each
 */
export const stackHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.POP, opPop],
  [Op.PUSH0, opPush0],
])

// Add PUSH1-PUSH32 handlers (all use the same function)
for (let i = Op.PUSH1; i <= Op.PUSH32; i++) {
  stackHandlers.set(i, opPush)
}

// Add DUP1-DUP16 handlers (all use the same function)
for (let i = Op.DUP1; i <= Op.DUP16; i++) {
  stackHandlers.set(i, opDup)
}

// Add SWAP1-SWAP16 handlers (all use the same function)
for (let i = Op.SWAP1; i <= Op.SWAP16; i++) {
  stackHandlers.set(i, opSwap)
}
