import type { PrefixedHexString } from '@ts-ethereum/utils'
import { hexToBytes } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { toJSONRPCBlock } from './helpers'
import { getBlockByHashSchema } from './schema'

export const getBlockByHash = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getBlockByHashSchema,
    async (params: [PrefixedHexString, boolean], _c) => {
      const [blockHash, includeTransactions] = params
      try {
        const block = await chain.getBlock(hexToBytes(blockHash))
        return safeResult(
          await toJSONRPCBlock(block, chain, includeTransactions),
        )
      } catch {
        return safeResult(null)
      }
    },
  )
}
