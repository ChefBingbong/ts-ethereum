import { intToHex } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getBlockTransactionCountByNumberSchema } from './schema'

export const getBlockTransactionCountByNumber = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getBlockTransactionCountByNumberSchema,
    async (params: [string], _c) => {
      const [blockOpt] = params
      const block = await getBlockByOption(blockOpt, chain)
      return safeResult(intToHex(block.transactions.length))
    },
  )
}
