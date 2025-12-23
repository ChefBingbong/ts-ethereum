import { intToHex } from '@ts-ethereum/utils'
import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { protocolVersionSchema } from './schema'

export const protocolVersion = (_node: ExecutionNode) => {
  // For P2P, protocols are handled via EthHandler - default to ETH/68
  const ethVersion = 68 // ETH/68 is the current version
  return createRpcMethod(protocolVersionSchema, async (_params, _c) => {
    return safeResult(intToHex(ethVersion))
  })
}
