import type { PrefixedHexString } from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption, toJSONRPCTx } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getTransactionByBlockNumberAndIndexSchema } from './schema'

export const getTransactionByBlockNumberAndIndex = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getTransactionByBlockNumberAndIndexSchema,
    async (params: [PrefixedHexString, string], _c) => {
      try {
        const [blockNumber, txIndexHex] = params
        const txIndex = parseInt(txIndexHex, 16)
        const block = await getBlockByOption(blockNumber, chain)
        if (block.transactions.length <= txIndex) {
          return safeResult(null)
        }

        const tx = block.transactions[txIndex]
        return safeResult(toJSONRPCTx(tx, block, txIndex))
      } catch (error: any) {
        return safeError(error)
      }
    },
  )
}
