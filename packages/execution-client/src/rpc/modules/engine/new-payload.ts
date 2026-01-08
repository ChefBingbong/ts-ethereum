import type { Block, ExecutionPayload } from '@ts-ethereum/block'
import { Hardfork } from '@ts-ethereum/chain-config'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
  bytesToHex,
  bytesToUnprefixedHex,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  safeResult,
} from '@ts-ethereum/utils'
import { ExecStatus } from '../../../execution/index'
import type { ExecutionNode } from '../../../node/index'
import { PutStatus } from '../../../sync/index'
import { short } from '../../../util/index'
import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  UNSUPPORTED_FORK,
} from '../../error-code'
import { createRpcMethod } from '../../validation'
import type { EngineContext } from './context'
import {
  newPayloadV1Schema,
  newPayloadV2Schema,
  newPayloadV3Schema,
  newPayloadV4Schema,
} from './schema'
import {
  type ExecutionPayloadV1,
  type ExecutionPayloadV2,
  type ExecutionPayloadV3,
  type PayloadStatusV1,
  Status,
} from './types'
import {
  assembleBlock,
  recursivelyFindParents,
  validExecutedChainBlock,
  validHash,
} from './util/index'

/**
 * Core newPayload implementation shared by all versions
 */
const newPayloadCore = async (
  ctx: EngineContext,
  params: [
    ExecutionPayload,
    (PrefixedHexString[] | null)?,
    (PrefixedHexString | null)?,
    (PrefixedHexString[] | null)?,
  ],
): Promise<PayloadStatusV1> => {
  const [
    payload,
    blobVersionedHashes,
    parentBeaconBlockRoot,
    executionRequests,
  ] = params
  if (ctx.config.synchronized) {
    ctx.connectionManager.newPayloadLog()
  }
  const { parentHash, blockHash } = payload

  // Remove this block from invalidBlocks for it to be evaluated again
  ctx.invalidBlocks.delete(blockHash.slice(2))

  // See if block can be assembled from payload
  const { block: headBlock, error } = await assembleBlock(
    payload,
    {
      parentBeaconBlockRoot: parentBeaconBlockRoot ?? undefined,
      blobVersionedHashes: blobVersionedHashes ?? undefined,
      executionRequests: executionRequests ?? undefined,
    },
    ctx.chain,
    ctx.chainCache,
  )

  if (headBlock === undefined || error !== undefined) {
    let response = error
    if (!response) {
      const validationError = `Error assembling block from payload during initialization`
      ctx.config.logger?.debug(validationError)
      const latestValidHash = await validHash(
        hexToBytes(parentHash as PrefixedHexString),
        ctx.chain,
        ctx.chainCache,
      )
      response = { status: Status.INVALID, latestValidHash, validationError }
    }
    return response
  }

  // Stats and hardfork updates
  ctx.connectionManager.updatePayloadStats(headBlock)
  const hardfork = headBlock.hardfork
  if (
    hardfork !== ctx.lastNewPayloadHF.value &&
    ctx.lastNewPayloadHF.value !== ''
  ) {
    ctx.config.logger?.info(
      `Hardfork change along new payload block number=${headBlock.header.number} hash=${short(
        headBlock.hash(),
      )} old=${ctx.lastNewPayloadHF.value} new=${hardfork}`,
    )
  }
  ctx.lastNewPayloadHF.value = hardfork

  try {
    // Get the parent from beacon skeleton or from remoteBlocks cache or from the chain
    const parent =
      (await ctx.skeleton.getBlockByHash(
        hexToBytes(parentHash as PrefixedHexString),
        true,
      )) ??
      ctx.remoteBlocks.get(parentHash.slice(2)) ??
      (await ctx.chain.getBlock(hexToBytes(parentHash as PrefixedHexString)))

    // Validate 4844 transactions
    if (
      ctx.chain.config.hardforkManager.isEIPActiveAtBlock(4844, {
        blockNumber: headBlock.header.number,
      })
    ) {
      try {
        headBlock.validateBlobTransactions(parent.header)
      } catch {
        const validationError = `Invalid 4844 transactions: ${error}`
        const latestValidHash = await validHash(
          hexToBytes(parentHash as PrefixedHexString),
          ctx.chain,
          ctx.chainCache,
        )
        return { status: Status.INVALID, latestValidHash, validationError }
      }
    }

    // Check for executed parent
    const executedParentExists =
      ctx.executedBlocks.get(parentHash.slice(2)) ??
      (await validExecutedChainBlock(
        hexToBytes(parentHash as PrefixedHexString),
        ctx.chain,
      ))
    if (!executedParentExists) {
      throw EthereumJSErrorWithoutCode(
        `Parent block not yet executed number=${parent.header.number}`,
      )
    }
  } catch {
    // Stash the block for a potential forced forkchoice update to it later
    ctx.remoteBlocks.set(bytesToUnprefixedHex(headBlock.hash()), headBlock)

    const optimisticLookup = !(await ctx.skeleton.setHead(headBlock, false))

    // Invalid skeleton PUT
    if (
      ctx.skeleton.fillStatus?.status === PutStatus.INVALID &&
      optimisticLookup &&
      headBlock.header.number >= ctx.skeleton.fillStatus.height
    ) {
      const latestValidHash =
        ctx.chain.blocks.latest !== null
          ? await validHash(
              ctx.chain.blocks.latest.hash(),
              ctx.chain,
              ctx.chainCache,
            )
          : bytesToHex(new Uint8Array(32))
      return {
        status: Status.INVALID,
        validationError: ctx.skeleton.fillStatus.validationError ?? '',
        latestValidHash,
      }
    }

    // Invalid execution
    if (
      ctx.execution.chainStatus?.status === ExecStatus.INVALID &&
      optimisticLookup &&
      headBlock.header.number >= ctx.execution.chainStatus.height
    ) {
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
        return { status: Status.INVALID, latestValidHash, validationError }
      }
    }

    const status = optimisticLookup === true ? Status.SYNCING : Status.ACCEPTED
    return { status, validationError: null, latestValidHash: null }
  }

  // Optimistic lookup
  const optimisticLookup = !(await ctx.skeleton.setHead(headBlock, false))
  if (
    ctx.skeleton.fillStatus?.status === PutStatus.INVALID &&
    optimisticLookup &&
    headBlock.header.number >= ctx.skeleton.fillStatus.height
  ) {
    const latestValidHash =
      ctx.chain.blocks.latest !== null
        ? await validHash(
            ctx.chain.blocks.latest.hash(),
            ctx.chain,
            ctx.chainCache,
          )
        : bytesToHex(new Uint8Array(32))
    return {
      status: Status.INVALID,
      validationError: ctx.skeleton.fillStatus.validationError ?? '',
      latestValidHash,
    }
  }

  ctx.remoteBlocks.set(bytesToUnprefixedHex(headBlock.hash()), headBlock)

  // Check if block exists executed
  const executedBlockExists =
    ctx.executedBlocks.get(blockHash.slice(2)) ??
    (await validExecutedChainBlock(
      hexToBytes(blockHash as PrefixedHexString),
      ctx.chain,
    ))
  if (executedBlockExists) {
    return {
      status: Status.VALID,
      latestValidHash: blockHash as PrefixedHexString,
      validationError: null,
    }
  }

  if (
    ctx.execution.chainStatus?.status === ExecStatus.INVALID &&
    optimisticLookup &&
    headBlock.header.number >= ctx.execution.chainStatus.height
  ) {
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
      return { status: Status.INVALID, latestValidHash, validationError }
    }
  }

  // Execute blocks
  const vmHead =
    ctx.chainCache.executedBlocks.get(parentHash.slice(2)) ??
    (await ctx.chain.blockchain.getIteratorHead())
  let blocks: Block[]
  try {
    blocks = await recursivelyFindParents(
      vmHead.hash(),
      headBlock.header.parentHash,
      ctx.chain,
    )
  } catch {
    return {
      status: Status.SYNCING,
      latestValidHash: null,
      validationError: null,
    }
  }

  blocks.push(headBlock)

  let lastBlock: Block
  try {
    for (const [i, block] of blocks.entries()) {
      lastBlock = block
      const bHash = block.hash()

      const isBlockExecuted =
        (ctx.executedBlocks.get(bytesToUnprefixedHex(bHash)) ??
          (await validExecutedChainBlock(bHash, ctx.chain))) !== null

      if (!isBlockExecuted) {
        const shouldExecuteBlock =
          blocks.length - i <=
            ctx.chain.config.options.engineNewpayloadMaxExecute &&
          block.transactions.length <=
            ctx.chain.config.options.engineNewpayloadMaxTxsExecute

        const executed =
          shouldExecuteBlock &&
          (await (async () => {
            const blockParent =
              i > 0
                ? blocks[i - 1]
                : (ctx.chainCache.remoteBlocks.get(
                    bytesToHex(block.header.parentHash).slice(2),
                  ) ?? (await ctx.chain.getBlock(block.header.parentHash)))
            const blockExecuted = await ctx.execution.runWithoutSetHead({
              block,
              root: blockParent.header.stateRoot,
              parentBlock: blockParent,
            })
            return blockExecuted
          })())

        if (!executed) {
          ctx.config.logger?.debug(
            `Skipping block(s) execution for headBlock=${headBlock.header.number} hash=${short(
              headBlock.hash(),
            )} : pendingBlocks=${blocks.length - i}(limit=${
              ctx.chain.config.options.engineNewpayloadMaxExecute
            }) transactions=${block.transactions.length}(limit=${
              ctx.chain.config.options.engineNewpayloadMaxTxsExecute
            }) executionBusy=${ctx.execution.running}`,
          )
          const status =
            optimisticLookup === true ? Status.SYNCING : Status.ACCEPTED
          return { status, latestValidHash: null, validationError: null }
        } else {
          ctx.executedBlocks.set(bytesToUnprefixedHex(block.hash()), block)
        }
      }
    }
  } catch (error) {
    const latestValidHash = await validHash(
      headBlock.header.parentHash,
      ctx.chain,
      ctx.chainCache,
    )

    const errorMsg = `${error}`.toLowerCase()
    if (errorMsg.includes('block') && errorMsg.includes('not found')) {
      if (blocks.length > 1) {
        return {
          status: Status.SYNCING,
          latestValidHash,
          validationError: null,
        }
      } else {
        throw { code: INTERNAL_ERROR, message: errorMsg }
      }
    }

    const validationError = `Error verifying block while running: ${errorMsg}`
    ctx.config.logger?.error(validationError)

    ctx.invalidBlocks.set(blockHash.slice(2), error as Error)
    ctx.remoteBlocks.delete(blockHash.slice(2))
    try {
      await ctx.chain.blockchain.delBlock(lastBlock!.hash())
    } catch {}
    try {
      await ctx.skeleton.deleteBlock(lastBlock!)
    } catch {}
    return { status: Status.INVALID, latestValidHash, validationError }
  }

  return {
    status: Status.VALID,
    latestValidHash: bytesToHex(headBlock.hash()),
    validationError: null,
  }
}

/**
 * engine_newPayloadV1
 */
export const newPayloadV1 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(newPayloadV1Schema, async (params, _c) => {
    const [payload] = params as [ExecutionPayloadV1]
    const shanghaiTimestamp =
      ctx.chain.config.hardforkManager.hardforkTimestamp(Hardfork.Shanghai)
    const ts = BigInt(payload.timestamp)
    if (shanghaiTimestamp !== undefined && ts >= shanghaiTimestamp) {
      throw {
        code: INVALID_PARAMS,
        message: 'NewPayloadV2 MUST be used after Shanghai is activated',
      }
    }

    const result = await newPayloadCore(ctx, [payload])
    ctx.connectionManager.lastNewPayload({ payload, response: result })
    return safeResult(result)
  })
}

/**
 * engine_newPayloadV2
 */
export const newPayloadV2 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(newPayloadV2Schema, async (params, _c) => {
    const [payload] = params as [ExecutionPayloadV2 | ExecutionPayloadV1]
    const shanghaiTimestamp =
      ctx.chain.config.hardforkManager.hardforkTimestamp(Hardfork.Shanghai)
    const eip4844Timestamp = ctx.chain.config.hardforkManager.hardforkTimestamp(
      Hardfork.Cancun,
    )
    const ts = BigInt(payload.timestamp)

    const withdrawals = (payload as ExecutionPayloadV2).withdrawals

    if (eip4844Timestamp !== undefined && ts >= eip4844Timestamp) {
      throw {
        code: INVALID_PARAMS,
        message: 'NewPayloadV3 MUST be used after Cancun is activated',
      }
    } else if (shanghaiTimestamp === undefined || ts < shanghaiTimestamp) {
      if (withdrawals !== undefined && withdrawals !== null) {
        throw {
          code: INVALID_PARAMS,
          message:
            'ExecutionPayloadV1 MUST be used before Shanghai is activated',
        }
      }
    } else if (ts >= shanghaiTimestamp) {
      if (withdrawals === undefined || withdrawals === null) {
        throw {
          code: INVALID_PARAMS,
          message:
            'ExecutionPayloadV2 MUST be used after Shanghai is activated',
        }
      }
      const payloadAsV3 = payload as ExecutionPayloadV3
      const { excessBlobGas, blobGasUsed } = payloadAsV3

      if (excessBlobGas !== undefined && excessBlobGas !== null) {
        throw {
          code: INVALID_PARAMS,
          message: 'Invalid PayloadV2: excessBlobGas is defined',
        }
      }
      if (blobGasUsed !== undefined && blobGasUsed !== null) {
        throw {
          code: INVALID_PARAMS,
          message: 'Invalid PayloadV2: blobGasUsed is defined',
        }
      }
    }

    const newPayloadRes = await newPayloadCore(ctx, [payload])
    if (newPayloadRes.status === Status.INVALID_BLOCK_HASH) {
      newPayloadRes.status = Status.INVALID
      newPayloadRes.latestValidHash = null
    }
    ctx.connectionManager.lastNewPayload({ payload, response: newPayloadRes })
    return safeResult(newPayloadRes)
  })
}

/**
 * engine_newPayloadV3
 */
export const newPayloadV3 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(newPayloadV3Schema, async (params, _c) => {
    const [payload, blobVersionedHashes, parentBeaconBlockRoot] = params as [
      ExecutionPayloadV3,
      PrefixedHexString[],
      PrefixedHexString,
    ]
    const eip4844Timestamp = ctx.chain.config.hardforkManager.hardforkTimestamp(
      Hardfork.Cancun,
    )
    const pragueTimestamp = ctx.chain.config.hardforkManager.hardforkTimestamp(
      Hardfork.Prague,
    )

    const ts = BigInt(payload.timestamp)
    if (pragueTimestamp !== undefined && ts >= pragueTimestamp) {
      throw {
        code: INVALID_PARAMS,
        message: 'NewPayloadV4 MUST be used after Prague is activated',
      }
    } else if (eip4844Timestamp === undefined || ts < eip4844Timestamp) {
      throw {
        code: UNSUPPORTED_FORK,
        message: 'NewPayloadV{1|2} MUST be used before Cancun is activated',
      }
    }

    const newPayloadRes = await newPayloadCore(ctx, [
      payload,
      blobVersionedHashes,
      parentBeaconBlockRoot,
    ])
    if (newPayloadRes.status === Status.INVALID_BLOCK_HASH) {
      newPayloadRes.status = Status.INVALID
      newPayloadRes.latestValidHash = null
    }
    ctx.connectionManager.lastNewPayload({ payload, response: newPayloadRes })
    return safeResult(newPayloadRes)
  })
}

/**
 * engine_newPayloadV4
 */
export const newPayloadV4 = (node: ExecutionNode, ctx: EngineContext) => {
  return createRpcMethod(newPayloadV4Schema, async (params, _c) => {
    const [
      payload,
      blobVersionedHashes,
      parentBeaconBlockRoot,
      executionRequests,
    ] = params as [
      ExecutionPayloadV3,
      PrefixedHexString[],
      PrefixedHexString,
      PrefixedHexString[],
    ]
    const pragueTimestamp = ctx.chain.config.hardforkManager.hardforkTimestamp(
      Hardfork.Prague,
    )
    const ts = BigInt(payload.timestamp)
    if (pragueTimestamp === undefined || ts < pragueTimestamp) {
      throw {
        code: UNSUPPORTED_FORK,
        message: 'NewPayloadV{1|2|3} MUST be used before Prague is activated',
      }
    }

    const newPayloadRes = await newPayloadCore(ctx, [
      payload,
      blobVersionedHashes,
      parentBeaconBlockRoot,
      executionRequests,
    ])
    if (newPayloadRes.status === Status.INVALID_BLOCK_HASH) {
      newPayloadRes.status = Status.INVALID
      newPayloadRes.latestValidHash = null
    }
    ctx.connectionManager.lastNewPayload({ payload, response: newPayloadRes })
    return safeResult(newPayloadRes)
  })
}
