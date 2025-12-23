import { addHexPrefix, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { peerCountSchema } from './schema'

export const peerCount = (node: ExecutionNode) => {
  return createRpcMethod(peerCountSchema, async (_params, _c) => {
    return safeResult(
      addHexPrefix(node.network.core.getPeerCount().toString(16)),
    )
  })
}
