import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { EngineRpcMethods } from '../types'
import type { EngineContext } from './context'
import { exchangeCapabilitiesSchema } from './schema'

/**
 * engine_exchangeCapabilities
 *
 * Returns a list of engine API endpoints supported by the client
 * https://github.com/ethereum/execution-apis/blob/main/src/engine/common.md#engine_exchangecapabilities
 */
export const exchangeCapabilities = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(exchangeCapabilitiesSchema, async (_params, _c) => {
    // Return all supported engine methods
    const capabilities = Object.values(EngineRpcMethods)
    ctx.connectionManager.updateStatus()
    return safeResult(capabilities)
  })
}
