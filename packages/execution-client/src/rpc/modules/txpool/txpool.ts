import type { ExecutionNode } from '../../../node/index'
import { RpcMethods, TxpoolRpcMethods } from '../types'
import { content } from './content'

export const createTxPoolRpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof TxpoolRpcMethods> => {
  return {
    txpool_content: content(node),
  }
}
