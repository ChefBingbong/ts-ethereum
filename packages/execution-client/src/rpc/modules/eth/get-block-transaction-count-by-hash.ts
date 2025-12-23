import type { PrefixedHexString } from '@ts-ethereum/utils'
import { hexToBytes, intToHex } from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { getBlockTransactionCountByHashSchema } from './schema'

export const getBlockTransactionCountByHash = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getBlockTransactionCountByHashSchema,
    async (params: [PrefixedHexString], _c) => {
      const [blockHash] = params
      try {
        const block = await chain.getBlock(hexToBytes(blockHash))
        return safeResult(intToHex(block.transactions.length))
      } catch {
        return safeError(new Error('Unknown block'))
      }
    },
  )
}
