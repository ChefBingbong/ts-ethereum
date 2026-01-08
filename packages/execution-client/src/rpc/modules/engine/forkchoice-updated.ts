import type { Block } from '@ts-ethereum/block'
import { Hardfork } from '@ts-ethereum/chain-config'
import {
  BIGINT_1,
  bytesToHex,
  equalsBytes,
  hexToBytes,
  safeResult,
} from '@ts-ethereum/utils'
import { ExecStatus } from '../../../execution/index'
import type { ExecutionNode } from '../../../node/index'
import { PutStatus } from '../../../sync/index'
import { short } from '../../../util/index'
import { INVALID_PARAMS } from '../../error-code'
import { createRpcMethod } from '../../validation'
import type { EngineContext } from './context'
import { logELStatus } from './context'
import {
  forkchoiceUpdatedV1Schema,
  forkchoiceUpdatedV2Schema,
  forkchoiceUpdatedV3Schema,
} from './schema'
import {
  type ForkchoiceResponseV1,
  type ForkchoiceStateV1,
  type PayloadAttributes,
  type PayloadAttributesV1,
  type PayloadAttributesV2,
  type PayloadAttributesV3,
  Status,
} from './types'
import {
  pruneCachedBlocks,
  recursivelyFindParents,
  validateHardforkRange,
  validExecutedChainBlock,
  validHash,
} from './util/index'

const zeroBlockHash = new Uint8Array(32)

/**
 * Core forkchoiceUpdated implementation shared by all versions
 */
const forkchoiceUpdatedCore = async (
  ctx: EngineContext,
  params: [
    forkchoiceState: ForkchoiceStateV1,
    payloadAttributes: PayloadAttributes | undefined,
  ],
): Promise<ForkchoiceResponseV1 & { headBlock?: Block }> => {
  const { headBlockHash, finalizedBlockHash, safeBlockHash } = params[0]
  const payloadAttributes = params[1]

  const safe = hexToBytes(safeBlockHash)
  const finalized = hexToBytes(finalizedBlockHash)

  if (
    !equalsBytes(finalized, zeroBlockHash) &&
    equalsBytes(safe, zeroBlockHash)
  ) {
    throw {
      code: INVALID_PARAMS,
      message: 'safe block can not be zero if finalized block is not zero',
    }
  }

  if (ctx.config.synchronized) {
    ctx.connectionManager.newForkchoiceLog()
  }

  // It is possible that newPayload didn't start beacon sync
  const executionService = ctx.node.execution
  const beaconSync = executionService.synchronizer
  if (!('skeleton' in beaconSync)) {
    // Switch to beacon sync if needed - this is handled differently in the new architecture
    // The synchronizer should already be a BeaconSynchronizer if we're post-merge
  }

  // Block previously marked INVALID
  const prevError = ctx.invalidBlocks.get(headBlockHash.slice(2))
  if (prevError !== undefined) {
    const validationError = `Received block previously marked INVALID: ${prevError.message}`
    ctx.config.logger?.debug(validationError)
    return {
      payloadStatus: {
        status: Status.INVALID,
        latestValidHash: null,
        validationError,
      },
      payloadId: null,
    }
  }

  // Forkchoice head block announced not known
  let headBlock: Block | undefined
  try {
    const head = hexToBytes(headBlockHash)
    headBlock =
      ctx.remoteBlocks.get(headBlockHash.slice(2)) ??
      (await ctx.skeleton.getBlockByHash(head, true)) ??
      (await ctx.chain.getBlock(head))
  } catch {
    ctx.config.logger?.debug(
      `Forkchoice announced head block unknown to EL hash=${short(headBlockHash)}`,
    )
    return {
      payloadStatus: {
        status: Status.SYNCING,
        latestValidHash: null,
        validationError: null,
      },
      payloadId: null,
    }
  }

  // Hardfork Update
  const hardfork = headBlock.header.hardfork
  if (
    hardfork !== ctx.lastForkchoiceUpdatedHF.value &&
    ctx.lastForkchoiceUpdatedHF.value !== ''
  ) {
    ctx.config.logger?.info(
      `Hardfork change along forkchoice head block update number=${
        headBlock.header.number
      } hash=${short(headBlock.hash())} old=${ctx.lastForkchoiceUpdatedHF.value} new=${hardfork}`,
    )
  }
  ctx.lastForkchoiceUpdatedHF.value = hardfork

  ctx.config.logger?.debug(
    `Forkchoice requested update to new head number=${headBlock.header.number} hash=${short(
      headBlock.hash(),
    )}`,
  )

  // Call skeleton sethead with force head change and reset beacon sync if reorg
  const { reorged, safeBlock, finalizedBlock } =
    await ctx.skeleton.forkchoiceUpdate(headBlock, {
      safeBlockHash: safe,
      finalizedBlockHash: finalized,
    })

  if (ctx.skeleton.fillStatus?.status === PutStatus.INVALID) {
    const latestValidHash =
      ctx.chain.blocks.latest !== null
        ? await validHash(
            ctx.chain.blocks.latest.hash(),
            ctx.chain,
            ctx.chainCache,
          )
        : bytesToHex(new Uint8Array(32))
    return {
      payloadStatus: {
        status: Status.INVALID,
        validationError: ctx.skeleton.fillStatus.validationError ?? '',
        latestValidHash,
      },
      payloadId: null,
    }
  }

  if (reorged && 'reorged' in beaconSync) {
    await (beaconSync as any).reorged(headBlock)
  }

  // Check execution status
  const isHeadExecuted =
    (ctx.executedBlocks.get(headBlockHash.slice(2)) ??
      (await validExecutedChainBlock(headBlock, ctx.chain))) !== null

  if (!isHeadExecuted) {
    if (ctx.execution.chainStatus?.status === ExecStatus.INVALID) {
      const invalidBlock = await ctx.skeleton.getBlockByHash(
        ctx.execution.chainStatus.hash,
        true,
      )
      if (invalidBlock !== undefined) {
        const latestValidHash = await validHash(
          invalidBlock.header.parentHash,
          ctx.chain,
          ctx.chainCache,
        )
        const validationError = `Block number=${invalidBlock.header.number} hash=${short(
          invalidBlock.hash(),
        )} root=${short(invalidBlock.header.stateRoot)} along the canonical chain is invalid`
        return {
          payloadStatus: {
            status: Status.INVALID,
            latestValidHash,
            validationError,
          },
          payloadId: null,
        }
      }
    }

    // Trigger the statebuild
    void ctx.node.buildHeadState()

    return {
      payloadStatus: {
        status: Status.SYNCING,
        latestValidHash: null,
        validationError: null,
      },
      payloadId: null,
    }
  }

  // Head block has been executed - can safely call setHead
  const vmHeadHash = (await ctx.chain.blockchain.getIteratorHead()).hash()
  if (!equalsBytes(vmHeadHash, headBlock.hash())) {
    let parentBlocks: Block[] = []
    if (
      ctx.chain.headers.latest &&
      ctx.chain.headers.latest.number < headBlock.header.number
    ) {
      try {
        parentBlocks = await recursivelyFindParents(
          vmHeadHash,
          headBlock.header.parentHash,
          ctx.chain,
        )
      } catch {
        return {
          payloadStatus: {
            status: Status.SYNCING,
            latestValidHash: null,
            validationError: null,
          },
          payloadId: null,
        }
      }
    }

    const blocks = [...parentBlocks, headBlock]
    try {
      const completed = await ctx.execution.setHead(blocks, {
        safeBlock,
        finalizedBlock,
      })
      if (!completed) {
        const latestValidHash = await validHash(
          headBlock.hash(),
          ctx.chain,
          ctx.chainCache,
        )
        return {
          payloadStatus: {
            status: Status.SYNCING,
            latestValidHash,
            validationError: null,
          },
          payloadId: null,
        }
      }
    } catch (error) {
      throw {
        message: (error as Error).message,
        code: INVALID_PARAMS,
      }
    }
    ctx.txPool.removeNewBlockTxs(blocks)
  } else if (!headBlock.isGenesis()) {
    try {
      await ctx.execution.setHead([headBlock], { safeBlock, finalizedBlock })
    } catch (e) {
      throw {
        message: (e as Error).message,
        code: INVALID_PARAMS,
      }
    }
  }

  // Synchronized and tx pool update
  ctx.config.updateSynchronizedState({
    synchronized: true,
    lastSynchronized: true,
    isAbleToSync: true,
    syncTargetHeight: headBlock.header.number,
    lastSyncDate: Date.now(),
  })
  if (ctx.chain.config.synchronized) {
    ctx.txPool.checkRunState()
  }

  // Build the block and prepare valid response
  let validResponse: ForkchoiceResponseV1 & { headBlock?: Block }
  if (payloadAttributes) {
    const {
      timestamp,
      prevRandao,
      suggestedFeeRecipient,
      withdrawals,
      parentBeaconBlockRoot,
    } = payloadAttributes
    const timestampBigInt = BigInt(timestamp)

    if (timestampBigInt <= headBlock.header.timestamp) {
      throw {
        message: `invalid timestamp in payloadAttributes, got ${timestampBigInt}, need at least ${
          headBlock.header.timestamp + BIGINT_1
        }`,
        code: INVALID_PARAMS,
      }
    }

    const payloadId = await ctx.pendingBlock.start(
      await ctx.vm.shallowCopy(),
      headBlock,
      {
        timestamp,
        mixHash: prevRandao,
        coinbase: suggestedFeeRecipient,
        parentBeaconBlockRoot,
      },
    )
    const latestValidHash = await validHash(
      headBlock.hash(),
      ctx.chain,
      ctx.chainCache,
    )
    const payloadStatus = {
      status: Status.VALID,
      latestValidHash,
      validationError: null,
    }
    validResponse = {
      payloadStatus,
      payloadId: bytesToHex(payloadId),
      headBlock,
    }
  } else {
    const latestValidHash = await validHash(
      headBlock.hash(),
      ctx.chain,
      ctx.chainCache,
    )
    const payloadStatus = {
      status: Status.VALID,
      latestValidHash,
      validationError: null,
    }
    validResponse = { payloadStatus, payloadId: null, headBlock }
  }

  // Prune cached blocks
  if (ctx.chain.config.options.pruneEngineCache) {
    pruneCachedBlocks(ctx.chain, ctx.chainCache)
  }
  return validResponse
}

/**
 * engine_forkchoiceUpdatedV1
 */
export const forkchoiceUpdatedV1 = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(forkchoiceUpdatedV1Schema, async (params, _c) => {
    const [forkchoiceState, payloadAttributes] = params as [
      ForkchoiceStateV1,
      PayloadAttributesV1 | null | undefined,
    ]

    if (payloadAttributes !== undefined && payloadAttributes !== null) {
      if (
        Object.values(payloadAttributes).filter(
          (attr) => attr !== null && attr !== undefined,
        ).length > 3
      ) {
        throw {
          code: INVALID_PARAMS,
          message: 'PayloadAttributesV1 MUST be used for forkchoiceUpdatedV2',
        }
      }
      validateHardforkRange(
        ctx.chain.config.hardforkManager,
        1,
        null,
        Hardfork.Paris,
        BigInt(payloadAttributes.timestamp),
      )
    }

    const result = await forkchoiceUpdatedCore(ctx, [
      forkchoiceState,
      payloadAttributes ?? undefined,
    ])
    ctx.connectionManager.lastForkchoiceUpdate({
      state: forkchoiceState,
      response: result,
      headBlock: result.headBlock,
    })
    logELStatus(ctx)
    delete result.headBlock
    return safeResult(result)
  })
}

/**
 * engine_forkchoiceUpdatedV2
 */
export const forkchoiceUpdatedV2 = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(forkchoiceUpdatedV2Schema, async (params, _c) => {
    const [forkchoiceState, payloadAttributes] = params as [
      ForkchoiceStateV1,
      PayloadAttributesV1 | PayloadAttributesV2 | null | undefined,
    ]

    if (payloadAttributes !== undefined && payloadAttributes !== null) {
      if (
        Object.values(payloadAttributes).filter(
          (attr) => attr !== null && attr !== undefined,
        ).length > 4
      ) {
        throw {
          code: INVALID_PARAMS,
          message:
            'PayloadAttributesV{1|2} MUST be used for forkchoiceUpdatedV2',
        }
      }

      validateHardforkRange(
        ctx.chain.config.options.common,
        2,
        null,
        Hardfork.Shanghai,
        BigInt(payloadAttributes.timestamp),
      )

      const shanghaiTimestamp =
        ctx.chain.config.options.common.hardforkTimestamp(Hardfork.Shanghai)
      const ts = BigInt(payloadAttributes.timestamp)
      const withdrawals = (payloadAttributes as PayloadAttributesV2).withdrawals
      if (withdrawals !== undefined && withdrawals !== null) {
        if (ts < shanghaiTimestamp!) {
          throw {
            code: INVALID_PARAMS,
            message:
              'PayloadAttributesV1 MUST be used before Shanghai is activated',
          }
        }
      } else {
        if (ts >= shanghaiTimestamp!) {
          throw {
            code: INVALID_PARAMS,
            message:
              'PayloadAttributesV2 MUST be used after Shanghai is activated',
          }
        }
      }
      const parentBeaconBlockRoot = (payloadAttributes as PayloadAttributesV3)
        .parentBeaconBlockRoot

      if (
        parentBeaconBlockRoot !== undefined &&
        parentBeaconBlockRoot !== null
      ) {
        throw {
          code: INVALID_PARAMS,
          message:
            'Invalid PayloadAttributesV{1|2}: parentBlockBeaconRoot defined',
        }
      }
    }

    const result = await forkchoiceUpdatedCore(ctx, [
      forkchoiceState,
      payloadAttributes ?? undefined,
    ])
    ctx.connectionManager.lastForkchoiceUpdate({
      state: forkchoiceState,
      response: result,
      headBlock: result.headBlock,
    })
    logELStatus(ctx)
    delete result.headBlock
    return safeResult(result)
  })
}

/**
 * engine_forkchoiceUpdatedV3
 */
export const forkchoiceUpdatedV3 = (
  node: ExecutionNode,
  ctx: EngineContext,
) => {
  return createRpcMethod(forkchoiceUpdatedV3Schema, async (params, _c) => {
    const [forkchoiceState, payloadAttributes] = params as [
      ForkchoiceStateV1,
      PayloadAttributesV3 | null | undefined,
    ]

    if (payloadAttributes !== undefined && payloadAttributes !== null) {
      if (
        Object.values(payloadAttributes).filter(
          (attr) => attr !== null && attr !== undefined,
        ).length > 5
      ) {
        throw {
          code: INVALID_PARAMS,
          message: 'PayloadAttributesV3 MUST be used for forkchoiceUpdatedV3',
        }
      }

      validateHardforkRange(
        ctx.chain.config.options.common,
        3,
        Hardfork.Cancun,
        null,
        BigInt(payloadAttributes.timestamp),
      )
    }

    const result = await forkchoiceUpdatedCore(ctx, [
      forkchoiceState,
      payloadAttributes ?? undefined,
    ])
    ctx.connectionManager.lastForkchoiceUpdate({
      state: forkchoiceState,
      response: result,
      headBlock: result.headBlock,
    })
    logELStatus(ctx)
    delete result.headBlock
    return safeResult(result)
  })
}
