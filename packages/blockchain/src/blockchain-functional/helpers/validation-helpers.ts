/**
 * Pure validation helper functions for blockchain operations.
 * All functions take required dependencies as arguments.
 */

import type { Block, BlockHeader } from '@ts-ethereum/block'
import type { HardforkManager } from '@ts-ethereum/chain-config'
import { Hardfork } from '@ts-ethereum/chain-config'
import {
  BIGINT_1,
  BIGINT_8,
  bytesToUnprefixedHex,
  EthereumJSErrorWithoutCode,
} from '@ts-ethereum/utils'
import type { DBManager } from '../../db/manager'
import type { Consensus, FrozenBlockchainConfig } from '../types'
import { getBlock, getHeader, hashToNumber, numberToHash } from './db-accessors'

/**
 * Context needed for header validation
 */
export interface HeaderValidationContext {
  hardforkManager: HardforkManager
  consensus?: Consensus
  getParentHeader: (hash: Uint8Array) => Promise<BlockHeader>
}

/**
 * Context needed for uncle validation
 */
export interface UncleValidationContext extends HeaderValidationContext {
  getBlock: (blockId: Uint8Array | bigint) => Promise<Block>
}

/**
 * Validates a block header against its parent.
 * Throws if invalid.
 *
 * Checks:
 * - parentHash is in the blockchain
 * - block number is parent + 1
 * - timestamp is strictly higher
 * - gas limit is valid
 * - PoW difficulty (if applicable)
 * - EIP-1559 base fee
 * - EIP-4844 blob gas
 * - EIP-7685 requests hash
 * - Uncle age bounds (if height provided)
 */
export async function validateHeader(
  header: BlockHeader,
  ctx: HeaderValidationContext,
  height?: bigint,
): Promise<void> {
  if (header.isGenesis()) {
    return
  }

  const parentHeader = await ctx.getParentHeader(header.parentHash)
  const { number } = header

  // Check block number is parent + 1
  if (number !== parentHeader.number + BIGINT_1) {
    throw EthereumJSErrorWithoutCode(`invalid number ${header.number}`)
  }

  // Check timestamp is strictly higher
  if (header.timestamp <= parentHeader.timestamp) {
    throw EthereumJSErrorWithoutCode(`invalid timestamp ${header.number}`)
  }

  // Validate difficulty (if not PoS)
  const consensusAlgo =
    header.hardforkManager.config.spec.chain.consensus.algorithm
  if (consensusAlgo !== 'pos' && ctx.consensus) {
    await ctx.consensus.validateDifficulty(header)
  }

  // Validate gas limit
  header.validateGasLimit(parentHeader.gasLimit)

  // Uncle-specific validation
  if (height !== undefined) {
    const dif = height - parentHeader.number

    if (!(dif < BIGINT_8 && dif > BIGINT_1)) {
      throw EthereumJSErrorWithoutCode(
        `uncle block has a parent that is too old or too young ${header.number}`,
      )
    }
  }

  // Determine hardfork for this block
  const blockHardfork = ctx.hardforkManager.getHardforkByBlock(
    number,
    header.timestamp,
  )

  // EIP-1559 base fee validation
  if (ctx.hardforkManager.isEIPActiveAtHardfork(1559, blockHardfork)) {
    let expectedBaseFee: bigint
    const londonHfBlock = ctx.hardforkManager.hardforkBlock(Hardfork.London)
    const isInitialEIP1559Block = number === londonHfBlock

    if (isInitialEIP1559Block) {
      expectedBaseFee = BigInt(
        ctx.hardforkManager.getParamAtHardfork(
          'initialBaseFee',
          blockHardfork,
        ) ?? 0n,
      )
    } else {
      expectedBaseFee = BigInt(parentHeader.calcNextBaseFee())
    }

    if (header.baseFeePerGas !== expectedBaseFee) {
      throw EthereumJSErrorWithoutCode(
        `Invalid block: base fee not correct ${header.number}`,
      )
    }
  }

  // EIP-4844 blob gas validation
  if (ctx.hardforkManager.isEIPActiveAtHardfork(4844, blockHardfork)) {
    const nextBlockHardfork = ctx.hardforkManager.getHardforkByBlock(
      number + BIGINT_1,
      header.timestamp,
    )
    const expectedExcessBlobGas =
      parentHeader.calcNextExcessBlobGas(nextBlockHardfork)

    if (header.excessBlobGas !== expectedExcessBlobGas) {
      throw EthereumJSErrorWithoutCode(
        `expected blob gas: ${expectedExcessBlobGas}, got: ${header.excessBlobGas}`,
      )
    }
  }

  // EIP-7685 requests hash validation
  if (ctx.hardforkManager.isEIPActiveAtHardfork(7685, blockHardfork)) {
    if (header.requestsHash === undefined) {
      throw EthereumJSErrorWithoutCode(
        `requestsHash must be provided when EIP-7685 is active`,
      )
    }
  }
}

/**
 * Validates uncle headers for a block.
 *
 * Checks:
 * - Each uncle is a valid header
 * - Uncle is an orphan (not in canonical chain)
 * - Uncle's parent is in canonical chain within last 7 blocks
 * - Uncle is not already included as uncle in another block
 */
export async function validateUncleHeaders(
  block: Block,
  ctx: UncleValidationContext,
): Promise<void> {
  const uncleHeaders = block.uncleHeaders
  if (uncleHeaders.length === 0) {
    return
  }

  // Validate each uncle header
  await Promise.all(
    uncleHeaders.map((uh) => validateHeader(uh, ctx, block.header.number)),
  )

  // Find lowest uncle number to determine how many blocks to fetch
  let lowestUncleNumber = block.header.number
  for (const header of uncleHeaders) {
    if (header.number < lowestUncleNumber) {
      lowestUncleNumber = header.number
    }
  }

  // Collect canonical chain hashes and included uncles
  const canonicalChainHashes: Record<string, boolean> = {}
  const includedUncles: Record<string, boolean> = {}

  const getBlocksCount = Number(
    block.header.number - lowestUncleNumber + BIGINT_1,
  )

  // Walk back through parent blocks
  let parentHash = block.header.parentHash
  for (let i = 0; i < getBlocksCount; i++) {
    const parentBlock = await ctx.getBlock(parentHash)

    // Mark block hash as part of canonical chain
    canonicalChainHashes[bytesToUnprefixedHex(parentBlock.hash())] = true

    // Mark included uncles
    for (const uh of parentBlock.uncleHeaders) {
      includedUncles[bytesToUnprefixedHex(uh.hash())] = true
    }

    parentHash = parentBlock.header.parentHash
  }

  // Validate each uncle
  for (const uh of uncleHeaders) {
    const uncleHash = bytesToUnprefixedHex(uh.hash())
    const parentHashHex = bytesToUnprefixedHex(uh.parentHash)

    if (!canonicalChainHashes[parentHashHex]) {
      throw EthereumJSErrorWithoutCode(
        `The parent hash of the uncle header is not part of the canonical chain ${block.errorStr()}`,
      )
    }

    if (includedUncles[uncleHash]) {
      throw EthereumJSErrorWithoutCode(
        `The uncle is already included in the canonical chain ${block.errorStr()}`,
      )
    }

    if (canonicalChainHashes[uncleHash]) {
      throw EthereumJSErrorWithoutCode(
        `The uncle is a canonical block ${block.errorStr()}`,
      )
    }
  }
}

/**
 * Validates a complete block.
 * Validates header, uncles, internal consistency, and blob transactions.
 */
export async function validateBlock(
  block: Block,
  ctx: UncleValidationContext,
): Promise<void> {
  // Validate header
  await validateHeader(block.header, ctx)

  // Validate uncles
  await validateUncleHeaders(block, ctx)

  // Validate internal data (transactions, tries, etc.)
  await block.validateData(false)

  // Validate blob transactions against parent
  const parentBlock = await ctx.getBlock(block.header.parentHash)
  block.validateBlobTransactions(parentBlock.header)
}

/**
 * Creates a header validation context from blockchain config and DB manager.
 */
export function createHeaderValidationContext(
  config: FrozenBlockchainConfig,
  dbManager: DBManager,
  consensus?: Consensus,
): HeaderValidationContext {
  return {
    hardforkManager: config.hardforkManager,
    consensus,
    getParentHeader: async (hash: Uint8Array) => {
      const number = await hashToNumber(dbManager, hash)
      if (number === undefined) {
        throw EthereumJSErrorWithoutCode(
          `no header for ${bytesToUnprefixedHex(hash)} found in DB`,
        )
      }
      return getHeader(dbManager, hash, number)
    },
  }
}

/**
 * Creates an uncle validation context from blockchain config and DB manager.
 */
export function createUncleValidationContext(
  config: FrozenBlockchainConfig,
  dbManager: DBManager,
  consensus?: Consensus,
): UncleValidationContext {
  const headerCtx = createHeaderValidationContext(config, dbManager, consensus)
  return {
    ...headerCtx,
    getBlock: async (blockId: Uint8Array | bigint) => {
      const block = await getBlock(dbManager, blockId)
      if (block === undefined) {
        throw EthereumJSErrorWithoutCode(`Block not found in DB`)
      }
      return block
    },
  }
}

/**
 * Validates that a block/header can be connected to the chain.
 * Checks that parent exists and chain IDs match.
 */
export async function validateCanConnect(
  block: Block,
  dbManager: DBManager,
  hardforkManager: HardforkManager,
): Promise<void> {
  if (block.isGenesis()) {
    return
  }

  // Check chain ID matches
  if (block.hardforkManager.chainId() !== hardforkManager.chainId()) {
    throw EthereumJSErrorWithoutCode(
      `Chain mismatch while trying to put block or header. Chain ID of block: ${block.hardforkManager.chainId()}, chain ID of blockchain: ${hardforkManager.chainId()}`,
    )
  }

  // Check parent exists (for non-genesis)
  const parentHash = await numberToHash(
    dbManager,
    block.header.number - BIGINT_1,
  )
  if (parentHash === undefined) {
    throw EthereumJSErrorWithoutCode(
      `Parent block not found for block ${block.header.number}`,
    )
  }
}
