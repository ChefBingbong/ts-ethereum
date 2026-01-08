/**
 * Log opcode handlers
 * LOG0, LOG1, LOG2, LOG3, LOG4
 */
import { BIGINT_0, bigIntToBytes, setLengthLeft } from '@ts-ethereum/utils'
import type { RunState } from '../../interpreter'
import { Op } from '../constants'
import type { ExecuteFunc } from '../types'

/**
 * LOG - Append log record (LOG0-LOG4)
 * Stack: [offset, length, topic0?, topic1?, topic2?, topic3?] -> []
 * Note: This handler works for all LOG opcodes (0xa0-0xa4)
 */
export const opLog: ExecuteFunc = (runState: RunState) => {
  const [memOffset, memLength] = runState.stack.popN(2)

  const topicsCount = runState.opCode - 0xa0

  const topics = runState.stack.popN(topicsCount)
  const topicsBuf = topics.map((a: bigint) =>
    setLengthLeft(bigIntToBytes(a), 32),
  )

  let mem = new Uint8Array(0)
  if (memLength !== BIGINT_0) {
    mem = runState.memory.read(Number(memOffset), Number(memLength))
  }

  runState.interpreter.log(mem, topicsCount, topicsBuf)
}

/**
 * Map of log opcodes to their handlers
 */
export const logHandlers: Map<number, ExecuteFunc> = new Map([
  [Op.LOG0, opLog],
  [Op.LOG1, opLog],
  [Op.LOG2, opLog],
  [Op.LOG3, opLog],
  [Op.LOG4, opLog],
])
