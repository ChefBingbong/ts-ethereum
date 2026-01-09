/**
 * Factory function to create a blockchain from raw block data.
 */

import type { BlockData } from '@ts-ethereum/block'
import { createBlock } from '@ts-ethereum/block'
import {
  createHardforkManagerFromConfig,
  Mainnet,
} from '@ts-ethereum/chain-config'
import type { BlockchainManager, CreateBlockchainOptions } from '../types'
import { createBlockchainManager } from './create'

/**
 * Creates a BlockchainManager from a list of block data objects.
 *
 * This is useful when bootstrapping a blockchain from JSON-serialized blocks
 * or when testing with pre-defined block sequences.
 *
 * @param blocksData - Array of block data objects to insert
 * @param opts - Options for creating the blockchain
 * @returns Initialized BlockchainManager with all blocks inserted
 */
export async function createBlockchainManagerFromBlocksData(
  blocksData: BlockData[],
  opts: CreateBlockchainOptions = {
    hardforkManager: createHardforkManagerFromConfig(Mainnet),
  },
): Promise<BlockchainManager> {
  // Create the base blockchain
  const blockchain = await createBlockchainManager(opts)

  // Insert all blocks
  for (const blockData of blocksData) {
    const block = createBlock(blockData, {
      hardforkManager: blockchain.hardforkManager,
      setHardfork: true,
    })
    await blockchain.putBlock(block)
  }

  return blockchain
}

/**
 * Creates a BlockchainManager from JSON-RPC formatted block data.
 * This handles the conversion from JSON-RPC response format.
 *
 * @param blocksData - Array of JSON-RPC block response objects
 * @param opts - Options for creating the blockchain
 * @returns Initialized BlockchainManager with all blocks inserted
 */
export async function createBlockchainManagerFromJsonRpcBlocks(
  blocksData: Record<string, unknown>[],
  opts: CreateBlockchainOptions = {
    hardforkManager: createHardforkManagerFromConfig(Mainnet),
  },
): Promise<BlockchainManager> {
  // Create the base blockchain
  const blockchain = await createBlockchainManager(opts)

  // Insert all blocks (createBlock handles JSON-RPC format conversion)
  for (const blockData of blocksData) {
    const block = createBlock(blockData as BlockData, {
      hardforkManager: blockchain.hardforkManager,
      setHardfork: true,
    })
    await blockchain.putBlock(block)
  }

  return blockchain
}
