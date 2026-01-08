/**
 * Engine API RPC module factory
 *
 * This module provides the consensus layer (CL) Engine API methods
 * for communication between execution and consensus clients.
 */

import type { ExecutionNode } from '../../../node/index'
import type { EngineRpcMethods, RpcMethods } from '../types'

import { createEngineContext, type EngineContext } from './context'
import { exchangeCapabilities } from './exchange-capabilities'
import {
  forkchoiceUpdatedV1,
  forkchoiceUpdatedV2,
  forkchoiceUpdatedV3,
} from './forkchoice-updated'
import { getBlobsV1, getBlobsV2 } from './get-blobs'
import {
  getPayloadV1,
  getPayloadV2,
  getPayloadV3,
  getPayloadV4,
  getPayloadV5,
} from './get-payload'
import {
  getPayloadBodiesByHashV1,
  getPayloadBodiesByRangeV1,
} from './get-payload-bodies'
import {
  newPayloadV1,
  newPayloadV2,
  newPayloadV3,
  newPayloadV4,
} from './new-payload'

export type { EngineContext }
export { createEngineContext }

/**
 * Creates the Engine API RPC methods for an ExecutionNode.
 *
 * @param node - The ExecutionNode instance
 * @returns An object containing all engine_* RPC methods
 */
export const createEngineRpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof EngineRpcMethods> => {
  // Create shared engine context
  const ctx = createEngineContext(node)

  return {
    // newPayload methods
    engine_newPayloadV1: newPayloadV1(node, ctx),
    engine_newPayloadV2: newPayloadV2(node, ctx),
    engine_newPayloadV3: newPayloadV3(node, ctx),
    engine_newPayloadV4: newPayloadV4(node, ctx),

    // forkchoiceUpdated methods
    engine_forkchoiceUpdatedV1: forkchoiceUpdatedV1(node, ctx),
    engine_forkchoiceUpdatedV2: forkchoiceUpdatedV2(node, ctx),
    engine_forkchoiceUpdatedV3: forkchoiceUpdatedV3(node, ctx),

    // getPayload methods
    engine_getPayloadV1: getPayloadV1(node, ctx),
    engine_getPayloadV2: getPayloadV2(node, ctx),
    engine_getPayloadV3: getPayloadV3(node, ctx),
    engine_getPayloadV4: getPayloadV4(node, ctx),
    engine_getPayloadV5: getPayloadV5(node, ctx),

    // exchangeCapabilities
    engine_exchangeCapabilities: exchangeCapabilities(node, ctx),

    // getPayloadBodies methods
    engine_getPayloadBodiesByHashV1: getPayloadBodiesByHashV1(node, ctx),
    engine_getPayloadBodiesByRangeV1: getPayloadBodiesByRangeV1(node, ctx),

    // getBlobs methods
    engine_getBlobsV1: getBlobsV1(node, ctx),
    engine_getBlobsV2: getBlobsV2(node, ctx),
  }
}
