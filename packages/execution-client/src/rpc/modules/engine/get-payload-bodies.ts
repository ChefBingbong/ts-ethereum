import { BIGINT_1, hexToBytes, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { INVALID_PARAMS, TOO_LARGE_REQUEST } from '../../error-code'
import { createRpcMethod } from '../../validation'
import type { EngineContext } from './context'
import {
  getPayloadBodiesByHashV1Schema,
  getPayloadBodiesByRangeV1Schema,
} from './schema'
import type { Bytes8, Bytes32, ExecutionPayloadBodyV1 } from './types'
import { getPayloadBody } from './util/index'

/**
 * engine_getPayloadBodiesByHashV1
 *
 * V1 (Shanghai HF), see:
 * https://github.com/ethereum/execution-apis/blob/main/src/engine/shanghai.md#engine_getpayloadbodiesbyhashv1
 *
 * @param params a list of block hashes as hex prefixed strings
 * @returns an array of ExecutionPayloadBodyV1 objects or null if a given execution payload isn't stored locally
 */
export const getPayloadBodiesByHashV1 = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(getPayloadBodiesByHashV1Schema, async (params, _c) => {
    const hashes = params as [Bytes32[]]
    if (hashes[0].length > 32) {
      throw {
        code: TOO_LARGE_REQUEST,
        message: 'More than 32 execution payload bodies requested',
      }
    }

    const hashBytes = hashes[0].map(hexToBytes)
    const blocks: (ExecutionPayloadBodyV1 | null)[] = []
    for (const hash of hashBytes) {
      try {
        const block = await ctx.chain.getBlock(hash)
        const payloadBody = getPayloadBody(block)
        blocks.push(payloadBody)
      } catch {
        blocks.push(null)
      }
    }

    ctx.connectionManager.updateStatus()
    return safeResult(blocks)
  })
}

/**
 * engine_getPayloadBodiesByRangeV1
 *
 * V1 (Shanghai HF), see:
 * https://github.com/ethereum/execution-apis/blob/main/src/engine/shanghai.md#engine_getpayloadbodiesbyrangev1
 *
 * @param params an array of 2 parameters
 *    1.  start: Bytes8 - the first block in the range
 *    2.  count: Bytes8 - the number of blocks requested
 * @returns an array of ExecutionPayloadBodyV1 objects or null if a given execution payload isn't stored locally
 */
export const getPayloadBodiesByRangeV1 = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(
    getPayloadBodiesByRangeV1Schema,
    async (params, _c) => {
      const [startHex, countHex] = params as [Bytes8, Bytes8]
      const start = BigInt(startHex)
      let count = BigInt(countHex)

      if (count > BigInt(32)) {
        throw {
          code: TOO_LARGE_REQUEST,
          message: 'More than 32 execution payload bodies requested',
        }
      }

      if (count < BIGINT_1 || start < BIGINT_1) {
        throw {
          code: INVALID_PARAMS,
          message: 'Start and Count parameters cannot be less than 1',
        }
      }

      const currentChainHeight = ctx.chain.headers.height
      if (start > currentChainHeight) {
        ctx.connectionManager.updateStatus()
        return safeResult([])
      }

      if (start + count > currentChainHeight) {
        count = currentChainHeight - start + BIGINT_1
      }

      const blocks = await ctx.chain.getBlocks(start, Number(count))
      const payloads: (ExecutionPayloadBodyV1 | null)[] = []
      for (const block of blocks) {
        try {
          const payloadBody = getPayloadBody(block)
          payloads.push(payloadBody)
        } catch {
          payloads.push(null)
        }
      }

      ctx.connectionManager.updateStatus()
      return safeResult(payloads)
    },
  )
}
