/**
 * Pure DB accessor functions for blockchain operations.
 * Following Geth's rawdb pattern - all functions take DB/context as first argument.
 */

import type { Block, BlockHeader } from '@ts-ethereum/block'
import { isBlock } from '@ts-ethereum/block'
import { RLP } from '@ts-ethereum/rlp'
import { BIGINT_0, bytesToUnprefixedHex } from '@ts-ethereum/utils'
import { bytesBE8 } from '../../db/constants'
import type { DBManager } from '../../db/manager'
import { DBOp, DBTarget } from '../../db/operation'
import type { SaveHeadOpsParams } from '../types'

// ============================================================================
// Read Operations (Pure)
// ============================================================================

/**
 * Gets a block from the database by ID (hash or number).
 */
export async function getBlock(
  dbManager: DBManager,
  blockId: Uint8Array | number | bigint,
): Promise<Block | undefined> {
  return dbManager.getBlock(blockId)
}

/**
 * Gets a header from the database by hash and number.
 */
export async function getHeader(
  dbManager: DBManager,
  hash: Uint8Array,
  number: bigint,
): Promise<BlockHeader> {
  return dbManager.getHeader(hash, number)
}

/**
 * Gets total difficulty for a block.
 */
export async function getTotalDifficulty(
  dbManager: DBManager,
  hash: Uint8Array,
  number: bigint,
): Promise<bigint> {
  return dbManager.getTotalDifficulty(hash, number)
}

/**
 * Converts a block number to its canonical hash.
 */
export async function numberToHash(
  dbManager: DBManager,
  blockNumber: bigint,
): Promise<Uint8Array | undefined> {
  return dbManager.numberToHash(blockNumber)
}

/**
 * Converts a block hash to its number.
 */
export async function hashToNumber(
  dbManager: DBManager,
  blockHash: Uint8Array,
): Promise<bigint | undefined> {
  try {
    return await dbManager.hashToNumber(blockHash)
  } catch {
    return undefined
  }
}

/**
 * Gets iterator heads from the database.
 */
export async function getHeads(
  dbManager: DBManager,
): Promise<Record<string, Uint8Array> | undefined> {
  return dbManager.getHeads()
}

/**
 * Gets the head header hash from the database.
 */
export async function getHeadHeader(
  dbManager: DBManager,
): Promise<Uint8Array | undefined> {
  return dbManager.getHeadHeader()
}

/**
 * Gets the head block hash from the database.
 */
export async function getHeadBlock(
  dbManager: DBManager,
): Promise<Uint8Array | undefined> {
  return dbManager.getHeadBlock()
}

// ============================================================================
// Write Operation Builders (Pure - return DBOp arrays)
// ============================================================================

/**
 * Creates DB operation to set total difficulty.
 */
export function createSetTDOp(
  td: bigint,
  blockNumber: bigint,
  blockHash: Uint8Array,
): DBOp {
  return DBOp.set(DBTarget.TotalDifficulty, RLP.encode(td), {
    blockNumber,
    blockHash,
  })
}

/**
 * Creates DB operations to store a block or header.
 * - Always adds a "Set Header Operation"
 * - Only adds "Set Body Operation" if body is non-empty or genesis block
 */
export function createSetBlockOrHeaderOps(
  blockBody: Block | BlockHeader,
): DBOp[] {
  const header: BlockHeader = isBlock(blockBody) ? blockBody.header : blockBody
  const dbOps: DBOp[] = []

  const blockNumber = header.number
  const blockHash = header.hash()

  const headerValue = header.serialize()
  dbOps.push(
    DBOp.set(DBTarget.Header, headerValue, {
      blockNumber,
      blockHash,
    }),
  )

  const isGenesis = header.number === BIGINT_0

  if (isGenesis || isBlock(blockBody)) {
    const bodyValue = RLP.encode(blockBody.raw().slice(1))
    dbOps.push(
      DBOp.set(DBTarget.Body, bodyValue, {
        blockNumber,
        blockHash,
      }),
    )
  }

  return dbOps
}

/**
 * Creates DB operation to set hash->number mapping.
 */
export function createSetHashToNumberOp(
  blockHash: Uint8Array,
  blockNumber: bigint,
): DBOp {
  const blockNumber8Byte = bytesBE8(blockNumber)
  return DBOp.set(DBTarget.HashToNumber, blockNumber8Byte, {
    blockHash,
  })
}

/**
 * Creates DB operations for number<->hash lookups.
 */
export function createSaveLookupOps(
  blockHash: Uint8Array,
  blockNumber: bigint,
  skipNumIndex?: boolean,
): DBOp[] {
  const ops: DBOp[] = []

  if (skipNumIndex !== true) {
    ops.push(DBOp.set(DBTarget.NumberToHash, blockHash, { blockNumber }))
  }

  const blockNumber8Bytes = bytesBE8(blockNumber)
  ops.push(
    DBOp.set(DBTarget.HashToNumber, blockNumber8Bytes, {
      blockHash,
    }),
  )

  return ops
}

/**
 * Creates DB operations to save head pointers.
 */
export function createSaveHeadOps(params: SaveHeadOpsParams): DBOp[] {
  // Convert DB heads to hex strings for efficient storage
  // LevelDB doesn't handle Uint8Arrays properly when they are part
  // of a JSON object being stored as a value
  const hexHeads = Object.fromEntries(
    Object.entries(params.heads).map((entry) => [
      entry[0],
      bytesToUnprefixedHex(entry[1]),
    ]),
  )

  return [
    DBOp.set(DBTarget.Heads, hexHeads),
    DBOp.set(DBTarget.HeadHeader, params.headHeaderHash),
    DBOp.set(DBTarget.HeadBlock, params.headBlockHash),
  ]
}

/**
 * Creates DB operation to delete a header.
 */
export function createDeleteHeaderOp(
  blockHash: Uint8Array,
  blockNumber: bigint,
): DBOp {
  return DBOp.del(DBTarget.Header, { blockHash, blockNumber })
}

/**
 * Creates DB operation to delete a body.
 */
export function createDeleteBodyOp(
  blockHash: Uint8Array,
  blockNumber: bigint,
): DBOp {
  return DBOp.del(DBTarget.Body, { blockHash, blockNumber })
}

/**
 * Creates DB operation to delete hash->number mapping.
 */
export function createDeleteHashToNumberOp(blockHash: Uint8Array): DBOp {
  return DBOp.del(DBTarget.HashToNumber, { blockHash })
}

/**
 * Creates DB operation to delete total difficulty.
 */
export function createDeleteTDOp(
  blockHash: Uint8Array,
  blockNumber: bigint,
): DBOp {
  return DBOp.del(DBTarget.TotalDifficulty, { blockHash, blockNumber })
}

/**
 * Creates DB operation to delete number->hash mapping.
 */
export function createDeleteNumberToHashOp(blockNumber: bigint): DBOp {
  return DBOp.del(DBTarget.NumberToHash, { blockNumber })
}

// ============================================================================
// Batch Operations (Execute)
// ============================================================================

/**
 * Executes a batch of DB operations.
 */
export async function executeBatch(
  dbManager: DBManager,
  ops: DBOp[],
): Promise<void> {
  await dbManager.batch(ops)
}

// ============================================================================
// Composite Operations (Pure builders)
// ============================================================================

/**
 * Creates all DB operations needed to delete a block entirely.
 */
export function createDeleteBlockOps(
  blockHash: Uint8Array,
  blockNumber: bigint,
): DBOp[] {
  return [
    createDeleteHeaderOp(blockHash, blockNumber),
    createDeleteBodyOp(blockHash, blockNumber),
    createDeleteHashToNumberOp(blockHash),
    createDeleteTDOp(blockHash, blockNumber),
  ]
}

// Re-export DBOp and DBTarget for convenience
export { DBOp, DBTarget }
