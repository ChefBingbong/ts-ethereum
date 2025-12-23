import { safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { getUncleCountByBlockNumberSchema } from './schema'

export const getUncleCountByBlockNumber = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getUncleCountByBlockNumberSchema,
    async (params: [string], _c) => {
      const [blockNumberHex] = params
      const blockNumber = BigInt(blockNumberHex)
      const latest =
        chain.headers.latest?.number ??
        (await chain.getCanonicalHeadHeader()).number

      if (blockNumber > latest) {
        return safeError(
          new Error('specified block greater than current height'),
        )
      }

      const block = await chain.getBlock(blockNumber)
      return safeResult(block.uncleHeaders.length)
    },
  )
}
