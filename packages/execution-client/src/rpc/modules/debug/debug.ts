import type { ExecutionNode } from '../../../node/index'
import { DebugRpcMethods, RpcMethods } from '../types'
import { getRawBlock } from './get-raw-block'
import { getRawHeader } from './get-raw-header'
import { getRawReceipts } from './get-raw-receipts'
import { getRawTransaction } from './get-raw-transaction'
import { setHead } from './set-head'
import { verbosity } from './verbosity'

export const createDebugRpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof DebugRpcMethods> => {
  return {
    debug_getRawBlock: getRawBlock(node),
    debug_getRawHeader: getRawHeader(node),
    debug_getRawReceipts: getRawReceipts(node),
    debug_getRawTransaction: getRawTransaction(node),
    debug_setHead: setHead(node),
    debug_verbosity: verbosity(node),
  }
}
