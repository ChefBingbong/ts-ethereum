import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { TOO_LARGE_REQUEST } from '../../error-code'
import { createRpcMethod } from '../../validation'
import type { EngineContext } from './context'
import { getBlobsSchema } from './schema'
import type { BlobAndProofV1, BlobAndProofV2, Bytes32 } from './types'

/**
 * engine_getBlobsV1
 *
 * Returns blob data and proofs for given versioned hashes from the transaction pool.
 */
export const getBlobsV1 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getBlobsSchema, async (params, _c) => {
    const hashes = params as [Bytes32[]]
    if (hashes[0].length > 128) {
      throw {
        code: TOO_LARGE_REQUEST,
        message: `More than 128 hashes queried`,
      }
    }

    const blobAndProofArr: (BlobAndProofV1 | null)[] = []
    for (const versionedHashHex of hashes[0]) {
      blobAndProofArr.push(
        ctx.txPool.blobAndProofByHash.get(versionedHashHex) ?? null,
      )
    }

    ctx.connectionManager.updateStatus()
    return safeResult(blobAndProofArr)
  })
}

/**
 * engine_getBlobsV2
 *
 * Returns blob data and proofs for given versioned hashes from the transaction pool.
 * V2 returns cell proofs instead of KZG proofs.
 */
export const getBlobsV2 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(getBlobsSchema, async (params, _c) => {
    const hashes = params as [Bytes32[]]
    if (hashes[0].length > 128) {
      throw {
        code: TOO_LARGE_REQUEST,
        message: `More than 128 hashes queried`,
      }
    }

    const blobAndProofsArr: BlobAndProofV2[] = []
    for (const versionedHashHex of hashes[0]) {
      const blobAndProofs = ctx.txPool.blobAndProofsByHash.get(versionedHashHex)
      if (blobAndProofs === undefined) {
        ctx.connectionManager.updateStatus()
        return safeResult(null)
      }
      blobAndProofsArr.push(blobAndProofs)
    }

    ctx.connectionManager.updateStatus()
    return safeResult(blobAndProofsArr)
  })
}
