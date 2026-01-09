/**
 * Pure genesis block helper functions.
 * All functions take required dependencies as arguments.
 */

import type { Block, HeaderData } from '@ts-ethereum/block'
import { createBlock } from '@ts-ethereum/block'
import type { GenesisState, HardforkManager } from '@ts-ethereum/chain-config'
import { genesisMPTStateRoot } from '@ts-ethereum/mpt'
import {
  concatBytes,
  hexToBigInt,
  KECCAK256_RLP,
  SHA256_NULL,
} from '@ts-ethereum/utils'

/**
 * Creates a genesis block for the blockchain with params from HardforkManager.genesis()
 *
 * @param stateRoot - The genesis state root
 * @param hardforkManager - HardforkManager instance
 * @returns Genesis block
 */
export function createGenesisBlock(
  stateRoot: Uint8Array,
  hardforkManager: HardforkManager,
): Block {
  // Determine hardfork for genesis block
  const genesisTimestamp = hardforkManager.genesis()?.timestamp
    ? hexToBigInt(hardforkManager.genesis()!.timestamp!)
    : undefined

  const genesisHardfork = hardforkManager.getHardforkByBlock(
    0n,
    genesisTimestamp,
  )

  const header: HeaderData = {
    ...hardforkManager.genesis(),
    number: 0,
    stateRoot,
    withdrawalsRoot: hardforkManager.isEIPActiveAtHardfork(
      4895,
      genesisHardfork,
    )
      ? KECCAK256_RLP
      : undefined,
    requestsHash: hardforkManager.isEIPActiveAtHardfork(7685, genesisHardfork)
      ? SHA256_NULL
      : undefined,
  }

  // Handle PoA consensus extra data
  if (hardforkManager.config.spec.chain.consensus.type === 'poa') {
    if (hardforkManager.genesis()?.extraData) {
      // Ensure extra data is populated from genesis data if provided
      header.extraData = hardforkManager.genesis()?.extraData
    } else {
      // Add required extraData (32 bytes vanity + 65 bytes filled with zeroes)
      header.extraData = concatBytes(new Uint8Array(32), new Uint8Array(65))
    }
  }

  return createBlock(
    {
      header,
      withdrawals: hardforkManager.isEIPActiveAtHardfork(4895, genesisHardfork)
        ? []
        : undefined,
    },
    { hardforkManager },
  )
}

/**
 * Generates the Merkle genesis state root from a genesis state.
 *
 * @param genesisState - Genesis state containing account balances and storage
 * @param _hardforkManager - HardforkManager (unused, kept for API compatibility)
 * @returns Genesis state root
 */
export async function genGenesisStateRoot(
  genesisState: GenesisState,
  _hardforkManager: HardforkManager,
): Promise<Uint8Array> {
  // HardforkManager is stateless, so no need to copy or set hardfork
  // The hardfork is determined from block context when needed
  return genesisMPTStateRoot(genesisState)
}

/**
 * Returns the genesis state root for well-known chains or an empty state's root.
 *
 * @param _chainId - Chain ID (currently unused, for future chain-specific roots)
 * @param hardforkManager - HardforkManager instance
 * @returns Genesis state root
 */
export async function getGenesisStateRoot(
  _chainId: number,
  hardforkManager: HardforkManager,
): Promise<Uint8Array> {
  // TODO: Support well-known chain genesis state roots
  // const chainGenesis = ChainGenesis[chainId]
  return genGenesisStateRoot({}, hardforkManager)
}

/**
 * Validates that a block is a valid genesis block.
 *
 * @param block - Block to validate
 * @returns True if block is genesis (number 0)
 */
export function isValidGenesisBlock(block: Block): boolean {
  return block.header.number === 0n
}

/**
 * Gets genesis-related parameters from HardforkManager.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns Genesis configuration
 */
export function getGenesisConfig(hardforkManager: HardforkManager): {
  timestamp: bigint | undefined
  hardfork: string
  withdrawalsEnabled: boolean
  requestsEnabled: boolean
} {
  const genesisTimestamp = hardforkManager.genesis()?.timestamp
    ? hexToBigInt(hardforkManager.genesis()!.timestamp!)
    : undefined

  const genesisHardfork = hardforkManager.getHardforkByBlock(
    0n,
    genesisTimestamp,
  )

  return {
    timestamp: genesisTimestamp,
    hardfork: genesisHardfork,
    withdrawalsEnabled: hardforkManager.isEIPActiveAtHardfork(
      4895,
      genesisHardfork,
    ),
    requestsEnabled: hardforkManager.isEIPActiveAtHardfork(
      7685,
      genesisHardfork,
    ),
  }
}

