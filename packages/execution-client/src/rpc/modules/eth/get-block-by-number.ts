import { safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { toJSONRPCBlock } from './helpers'
import { getBlockByNumberSchema } from './schema'

export const getBlockByNumber = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getBlockByNumberSchema,
    async (params: [string, boolean], _c) => {
      const [blockOpt, includeTransactions] = params
      if (blockOpt === 'pending') {
        return safeError(new Error(`"pending" is not yet supported`))
      }
      try {
        const block = await getBlockByOption(blockOpt, chain)
        const response = await toJSONRPCBlock(block, chain, includeTransactions)
        return safeResult(response)
      } catch {
        return safeResult(null)
      }
    },
  )
}
