import type { GenesisState, HardforkManager } from '@ts-ethereum/chain-config'
import { genesisMPTStateRoot } from '@ts-ethereum/mpt'

/**
 * Safe creation of a new Blockchain object awaiting the initialization function,
 * encouraged method to use when creating a blockchain object.
 *
 * @param opts Constructor options, see {@link BlockchainOptions}
 */

/**
 * Merkle genesis root
 * @param genesisState
 * @param hardforkManager
 * @returns
 */
export async function genGenesisStateRoot(
  genesisState: GenesisState,
  hardforkManager: HardforkManager,
): Promise<Uint8Array> {
  // HardforkManager is stateless, so no need to copy or set hardfork
  // The hardfork is determined from block context when needed
  return genesisMPTStateRoot(genesisState)
}

/**
 * Returns the genesis state root if chain is well known or an empty state's root otherwise
 */
export async function getGenesisStateRoot(
  chainId: any,
  hardforkManager: HardforkManager,
): Promise<Uint8Array> {
  // const chainGenesis = ChainGenesis[chainId]
  return genGenesisStateRoot({}, hardforkManager)
}
