import { bytesToHex } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getRawBlockSchema } from './schema'

export const getRawBlock = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(getRawBlockSchema, async (params: [string], _c) => {
    const [blockOpt] = params
    const block = await getBlockByOption(blockOpt, chain)
    return safeResult(bytesToHex(block.serialize()))
  })
}
