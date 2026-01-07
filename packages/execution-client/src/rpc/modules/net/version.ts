import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { versionSchema } from './schema'

export const version = (node: ExecutionNode) => {
  return createRpcMethod(versionSchema, async (_params, _c) => {
    return safeResult(node.chain.config.hardforkManager.chainId().toString())
  })
}
