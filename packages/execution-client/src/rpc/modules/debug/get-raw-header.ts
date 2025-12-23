import { bytesToHex } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getRawHeaderSchema } from './schema'

export const getRawHeader = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(getRawHeaderSchema, async (params: [string], _c) => {
    const [blockOpt] = params
    const block = await getBlockByOption(blockOpt, chain)
    return safeResult(bytesToHex(block.header.serialize()))
  })
}
