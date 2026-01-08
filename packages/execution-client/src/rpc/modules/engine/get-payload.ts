import { Hardfork } from '@ts-ethereum/chain-config'
import { bytesToUnprefixedHex, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { INTERNAL_ERROR, validEngineCodes } from '../../error-code'
import { createRpcMethod } from '../../validation'
import type { EngineContext } from './context'
import { getPayloadSchema } from './schema'
import { type Bytes8, EngineError } from './types'
import { blockToExecutionPayload, validateHardforkRange } from './util/index'

/**
 * Core getPayload implementation shared by all versions
 */
const getPayloadCore = async (
  ctx: EngineContext,
  params: [Bytes8],
  payloadVersion: number,
) => {
  const payloadId = params[0]
  try {
    // Build the pending block
    const built = await ctx.pendingBlock.build(payloadId)
    if (!built) {
      throw EngineError.UnknownPayload
    }
    // The third arg returned is the minerValue which we will use to value the block
    const [block, receipts, value, blobs, requests] = built

    // Do a blocking call even if execution might be busy
    const executed = await ctx.execution.runWithoutSetHead(
      { block },
      receipts,
      true,
      true,
    )
    if (!executed) {
      throw Error(
        `runWithoutSetHead did not execute the block for payload=${payloadId}`,
      )
    }

    ctx.executedBlocks.set(bytesToUnprefixedHex(block.hash()), block)

    // Creates the payload in ExecutionPayload format to be returned
    const executionPayload = blockToExecutionPayload(
      block,
      value,
      blobs,
      requests,
    )

    let checkNotBeforeHf: Hardfork | null
    let checkNotAfterHf: Hardfork | null

    switch (payloadVersion) {
      case 5:
        checkNotBeforeHf = Hardfork.Osaka
        checkNotAfterHf = Hardfork.Osaka
        break

      case 4:
        checkNotBeforeHf = Hardfork.Prague
        checkNotAfterHf = Hardfork.Prague
        break

      case 3:
        checkNotBeforeHf = Hardfork.Cancun
        checkNotAfterHf = Hardfork.Cancun
        break

      case 2:
        checkNotBeforeHf = null
        checkNotAfterHf = Hardfork.Shanghai
        break

      case 1:
        checkNotBeforeHf = null
        checkNotAfterHf = Hardfork.Paris
        break

      default:
        throw Error(`Invalid payloadVersion=${payloadVersion}`)
    }

    validateHardforkRange(
      ctx.chain.config.hardforkManager,
      payloadVersion,
      checkNotBeforeHf,
      checkNotAfterHf,
      BigInt(executionPayload.executionPayload.timestamp),
    )
    return executionPayload
  } catch (error: any) {
    if (validEngineCodes.includes(error.code)) throw error
    throw {
      code: INTERNAL_ERROR,
      message: error.message ?? error,
    }
  }
}

/**
 * engine_getPayloadV1
 */
export const getPayloadV1 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getPayloadSchema, async (params, _c) => {
    const { executionPayload } = await getPayloadCore(
      ctx,
      params as [Bytes8],
      1,
    )
    ctx.connectionManager.updateStatus()
    return safeResult(executionPayload)
  })
}

/**
 * engine_getPayloadV2
 */
export const getPayloadV2 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getPayloadSchema, async (params, _c) => {
    const { executionPayload, blockValue } = await getPayloadCore(
      ctx,
      params as [Bytes8],
      2,
    )
    ctx.connectionManager.updateStatus()
    return safeResult({ executionPayload, blockValue })
  })
}

/**
 * engine_getPayloadV3
 */
export const getPayloadV3 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getPayloadSchema, async (params, _c) => {
    const result = await getPayloadCore(ctx, params as [Bytes8], 3)
    ctx.connectionManager.updateStatus()
    return safeResult(result)
  })
}

/**
 * engine_getPayloadV4
 */
export const getPayloadV4 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getPayloadSchema, async (params, _c) => {
    const result = await getPayloadCore(ctx, params as [Bytes8], 4)
    ctx.connectionManager.updateStatus()
    return safeResult(result)
  })
}

/**
 * engine_getPayloadV5
 */
export const getPayloadV5 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getPayloadSchema, async (params, _c) => {
    const result = await getPayloadCore(ctx, params as [Bytes8], 5)
    ctx.connectionManager.updateStatus()
    return safeResult(result)
  })
}
