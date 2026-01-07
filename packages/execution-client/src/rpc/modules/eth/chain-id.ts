import { bigIntToHex, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { chainIdSchema } from './schema'

export const chainId = (node: ExecutionNode) => {
  return createRpcMethod(chainIdSchema, async (_params, _c) => {
    const chainId = node.chain.config.hardforkManager.chainId()
    return safeResult(bigIntToHex(chainId))
  })
}
