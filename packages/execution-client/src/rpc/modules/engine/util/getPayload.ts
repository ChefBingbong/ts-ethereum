import type { Block, ExecutionPayload } from '@ts-ethereum/block'
import {
  bigIntToHex,
  bytesToHex,
  type CLRequest,
  type CLRequestType,
} from '@ts-ethereum/utils'

import type { BlobsBundle } from '../../../../miner/index'
import type { BlobsBundleV1OrV2 } from '../types'

/**
 * Formats a block to {@link ExecutionPayloadV1}.
 */
export const blockToExecutionPayload = (
  block: Block,
  value: bigint,
  bundle?: BlobsBundle,
  requests?: CLRequest<CLRequestType>[],
) => {
  const executionPayload: ExecutionPayload = block.toExecutionPayload()
  // parentBeaconBlockRoot is not part of the CL payload
  if (executionPayload.parentBeaconBlockRoot !== undefined) {
    delete executionPayload.parentBeaconBlockRoot
  }

  const blobsBundle: BlobsBundleV1OrV2 | undefined = bundle ?? undefined

  // ethereumjs does not provide any transaction censoring detection (yet) to suggest
  // overriding builder/mev-boost blocks
  const shouldOverrideBuilder = false

  let executionRequests: string[] | undefined
  if (requests !== undefined) {
    executionRequests = []
    for (const request of requests) {
      if (request.bytes.length > 1) {
        executionRequests.push(bytesToHex(request.bytes))
      }
    }
  }

  return {
    executionPayload,
    executionRequests,
    blockValue: bigIntToHex(value),
    blobsBundle,
    shouldOverrideBuilder,
  }
}
