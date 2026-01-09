/**
 * Pure chain helper functions for blockchain reorg and canonical chain operations.
 * All functions take required dependencies as arguments and return results/operations
 * rather than mutating state directly.
 */

import type { Block, BlockHeader } from '@ts-ethereum/block'
import {
  BIGINT_0,
  BIGINT_1,
  EthereumJSErrorWithoutCode,
  equalsBytes,
} from '@ts-ethereum/utils'
import type { DBManager } from '../../db/manager'
import { DBOp, DBTarget } from '../../db/operation'
import type { BlockchainMutableState, CommonAncestorResult } from '../types'
import {
  createDeleteNumberToHashOp,
  createSaveLookupOps,
  getBlock,
  getHeader,
  hashToNumber,
  numberToHash,
} from './db-accessors'

/**
 * Context needed for chain operations
 */
export interface ChainOperationContext {
  dbManager: DBManager
  state: BlockchainMutableState
}

/**
 * Result of deleting canonical chain references
 */
export interface DeleteCanonicalResult {
  ops: DBOp[]
  deletedBlocks: Block[]
  updatedHeads: Record<string, Uint8Array>
  updatedHeadHeaderHash: Uint8Array | undefined
  updatedHeadBlockHash: Uint8Array | undefined
}

/**
 * Result of rebuilding canonical chain
 */
export interface RebuildCanonicalResult {
  ops: DBOp[]
  updatedHeads: Record<string, Uint8Array>
  updatedHeadBlockHash: Uint8Array | undefined
  staleHeadsCount: number
}

/**
 * Safely converts a block number to hash, returning false if not found.
 */
export async function safeNumberToHash(
  dbManager: DBManager,
  blockNumber: bigint,
): Promise<Uint8Array | false> {
  const hash = await numberToHash(dbManager, blockNumber)
  return hash ?? false
}

/**
 * Gets a header by hash, optionally with known number for efficiency.
 */
export async function getHeaderByHash(
  dbManager: DBManager,
  hash: Uint8Array,
  number?: bigint,
): Promise<BlockHeader> {
  if (number === undefined) {
    const resolvedNumber = await hashToNumber(dbManager, hash)
    if (resolvedNumber === undefined) {
      throw EthereumJSErrorWithoutCode(`no header for hash found in DB`)
    }
    number = resolvedNumber
  }
  return getHeader(dbManager, hash, number)
}

/**
 * Gets canonical header at a specific block number.
 */
export async function getCanonicalHeader(
  dbManager: DBManager,
  blockNumber: bigint,
): Promise<BlockHeader> {
  const hash = await numberToHash(dbManager, blockNumber)
  if (hash === undefined) {
    throw EthereumJSErrorWithoutCode(
      `header with number ${blockNumber} not found in canonical chain`,
    )
  }
  return getHeaderByHash(dbManager, hash, blockNumber)
}

/**
 * Finds the common ancestor between a new header and the current canonical head.
 *
 * @param newHeader - The new block header to find ancestor for
 * @param headHeaderHash - Current head header hash
 * @param dbManager - Database manager
 * @returns Common ancestor header and list of ancestor headers traversed
 */
export async function findCommonAncestor(
  newHeader: BlockHeader,
  headHeaderHash: Uint8Array,
  dbManager: DBManager,
): Promise<CommonAncestorResult> {
  const ancestorHeaders = new Set<BlockHeader>()

  let header = await getHeaderByHash(dbManager, headHeaderHash)

  // If current head is higher, start from the same height as new header
  if (header.number > newHeader.number) {
    header = await getCanonicalHeader(dbManager, newHeader.number)
    ancestorHeaders.add(header)
  } else {
    // Walk new header back to same height as current head
    while (header.number !== newHeader.number && newHeader.number > BIGINT_0) {
      newHeader = await getHeaderByHash(
        dbManager,
        newHeader.parentHash,
        newHeader.number - BIGINT_1,
      )
      ancestorHeaders.add(newHeader)
    }
  }

  if (header.number !== newHeader.number) {
    throw EthereumJSErrorWithoutCode('Failed to find ancient header')
  }

  // Walk both chains back until they meet
  while (
    !equalsBytes(header.hash(), newHeader.hash()) &&
    header.number > BIGINT_0
  ) {
    header = await getCanonicalHeader(dbManager, header.number - BIGINT_1)
    ancestorHeaders.add(header)
    newHeader = await getHeaderByHash(
      dbManager,
      newHeader.parentHash,
      newHeader.number - BIGINT_1,
    )
    ancestorHeaders.add(newHeader)
  }

  if (!equalsBytes(header.hash(), newHeader.hash())) {
    throw EthereumJSErrorWithoutCode('Failed to find ancient header')
  }

  return {
    commonAncestor: header,
    ancestorHeaders: Array.from(ancestorHeaders),
  }
}

/**
 * Creates operations to delete canonical chain references from a specific block number.
 * Also tracks which heads need updating and which blocks were deleted.
 *
 * This is a pure function that returns what should happen rather than mutating state.
 *
 * @param startBlockNumber - Block number to start deleting from
 * @param newHeadHash - Hash to set stale heads to
 * @param currentState - Current mutable state
 * @param dbManager - Database manager
 * @param trackDeletedBlocks - Whether to track deleted blocks for events
 * @returns Operations and state updates needed
 */
export async function createDeleteCanonicalChainOps(
  startBlockNumber: bigint,
  newHeadHash: Uint8Array,
  currentState: BlockchainMutableState,
  dbManager: DBManager,
  trackDeletedBlocks: boolean,
): Promise<DeleteCanonicalResult> {
  const ops: DBOp[] = []
  const deletedBlocks: Block[] = []
  const updatedHeads = { ...currentState.heads }
  let updatedHeadHeaderHash = currentState.headHeaderHash
  let updatedHeadBlockHash = currentState.headBlockHash

  let blockNumber = startBlockNumber
  let hash = await safeNumberToHash(dbManager, blockNumber)

  while (hash !== false) {
    ops.push(createDeleteNumberToHashOp(blockNumber))

    // Track deleted blocks if needed for events
    if (trackDeletedBlocks) {
      const block = await getBlock(dbManager, blockNumber)
      if (block) {
        deletedBlocks.push(block)
      }
    }

    // Reset stale iterator heads to new head
    for (const name of Object.keys(updatedHeads)) {
      if (equalsBytes(updatedHeads[name], hash)) {
        updatedHeads[name] = newHeadHash
      }
    }

    // Reset stale headHeader
    if (
      updatedHeadHeaderHash !== undefined &&
      equalsBytes(updatedHeadHeaderHash, hash)
    ) {
      updatedHeadHeaderHash = newHeadHash
    }

    // Reset stale headBlock
    if (
      updatedHeadBlockHash !== undefined &&
      equalsBytes(updatedHeadBlockHash, hash)
    ) {
      updatedHeadBlockHash = newHeadHash
    }

    blockNumber++
    hash = await safeNumberToHash(dbManager, blockNumber)
  }

  return {
    ops,
    deletedBlocks,
    updatedHeads,
    updatedHeadHeaderHash,
    updatedHeadBlockHash,
  }
}

/**
 * Creates operations to rebuild the canonical chain from a given header.
 * Walks backwards from the header, creating lookup operations for each block
 * until reaching a block that's already canonical.
 *
 * @param header - The new canonical header
 * @param currentState - Current mutable state
 * @param dbManager - Database manager
 * @returns Operations and state updates needed
 */
export async function createRebuildCanonicalOps(
  header: BlockHeader,
  currentState: BlockchainMutableState,
  dbManager: DBManager,
): Promise<RebuildCanonicalResult> {
  const ops: DBOp[] = []
  const updatedHeads = { ...currentState.heads }
  let updatedHeadBlockHash = currentState.headBlockHash
  let staleHeads: string[] = []
  let staleHeadBlock = false

  let currentNumber = header.number
  let currentCanonicalHash: Uint8Array = header.hash()

  // Check if we need to continue (stale hash differs or doesn't exist)
  const shouldContinue = async (): Promise<boolean> => {
    const staleHash = await safeNumberToHash(dbManager, currentNumber)
    currentCanonicalHash = header.hash()
    return staleHash === false || !equalsBytes(currentCanonicalHash, staleHash)
  }

  while (await shouldContinue()) {
    const blockHash = header.hash()
    const blockNumber = header.number

    // Stop at genesis
    if (blockNumber === BIGINT_0) {
      break
    }

    // Add lookup operations for this block
    const lookupOps = createSaveLookupOps(blockHash, blockNumber)
    ops.push(...lookupOps)

    // Track stale heads
    const staleHash = await safeNumberToHash(dbManager, currentNumber)
    if (staleHash !== false) {
      for (const name of Object.keys(updatedHeads)) {
        if (equalsBytes(updatedHeads[name], staleHash)) {
          staleHeads.push(name)
        }
      }

      // Flag stale headBlock
      if (
        updatedHeadBlockHash !== undefined &&
        equalsBytes(updatedHeadBlockHash, staleHash)
      ) {
        staleHeadBlock = true
      }
    }

    // Move to parent
    try {
      header = await getHeaderByHash(
        dbManager,
        header.parentHash,
        --currentNumber,
      )
    } catch {
      // Parent not found, stop
      staleHeads = []
      break
    }
  }

  // Update stale heads to current canonical hash
  for (const name of staleHeads) {
    updatedHeads[name] = currentCanonicalHash
  }

  // Update stale headBlock
  if (staleHeadBlock) {
    updatedHeadBlockHash = currentCanonicalHash
  }

  return {
    ops,
    updatedHeads,
    updatedHeadBlockHash,
    staleHeadsCount: staleHeads.length,
  }
}

/**
 * Creates operations to delete a block and all its children from the chain.
 * Used when a block needs to be completely removed (e.g., invalid block).
 */
export async function createDeleteChildOps(
  blockHash: Uint8Array,
  blockNumber: bigint,
  headHash: Uint8Array | null,
  currentState: BlockchainMutableState,
  dbManager: DBManager,
): Promise<{
  ops: DBOp[]
  updatedHeadHeaderHash: Uint8Array | undefined
  updatedHeadBlockHash: Uint8Array | undefined
}> {
  const ops: DBOp[] = []
  let updatedHeadHeaderHash = currentState.headHeaderHash
  let updatedHeadBlockHash = currentState.headBlockHash

  // Delete header, body, hash->number, and TD
  ops.push(DBOp.del(DBTarget.Header, { blockHash, blockNumber }))
  ops.push(DBOp.del(DBTarget.Body, { blockHash, blockNumber }))
  ops.push(DBOp.del(DBTarget.HashToNumber, { blockHash }))
  ops.push(DBOp.del(DBTarget.TotalDifficulty, { blockHash, blockNumber }))

  if (!headHash) {
    return { ops, updatedHeadHeaderHash, updatedHeadBlockHash }
  }

  // Update head pointers if they point to deleted block
  if (
    updatedHeadHeaderHash !== undefined &&
    equalsBytes(updatedHeadHeaderHash, blockHash)
  ) {
    updatedHeadHeaderHash = headHash
  }

  if (
    updatedHeadBlockHash !== undefined &&
    equalsBytes(updatedHeadBlockHash, blockHash)
  ) {
    updatedHeadBlockHash = headHash
  }

  // Recursively delete child blocks
  try {
    const childHeader = await getCanonicalHeader(
      dbManager,
      blockNumber + BIGINT_1,
    )
    const childResult = await createDeleteChildOps(
      childHeader.hash(),
      childHeader.number,
      headHash,
      {
        ...currentState,
        headHeaderHash: updatedHeadHeaderHash,
        headBlockHash: updatedHeadBlockHash,
      },
      dbManager,
    )
    ops.push(...childResult.ops)
    updatedHeadHeaderHash = childResult.updatedHeadHeaderHash
    updatedHeadBlockHash = childResult.updatedHeadBlockHash
  } catch {
    // No child block found, stop recursion
  }

  return { ops, updatedHeadHeaderHash, updatedHeadBlockHash }
}

