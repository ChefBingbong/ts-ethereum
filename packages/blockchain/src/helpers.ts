import {
  type Chain,
  ChainGenesis,
  type GenesisState,
  type GlobalConfig,
} from '@ts-ethereum/chain-config'
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
 * @param common
 * @returns
 */
export async function genGenesisStateRoot(
  genesisState: GenesisState,
  common: GlobalConfig,
): Promise<Uint8Array> {
  const genCommon = common.copy()
  genCommon.setHardforkBy({
    blockNumber: 0,
    timestamp: genCommon.genesis()?.timestamp ?? 0,
  })
  return genesisMPTStateRoot(genesisState)
}

/**
 * Returns the genesis state root if chain is well known or an empty state's root otherwise
 */
export async function getGenesisStateRoot(
  chainId: Chain,
  common: GlobalConfig,
): Promise<Uint8Array> {
  const chainGenesis = ChainGenesis[chainId]
  return chainGenesis !== undefined
    ? chainGenesis.stateRoot
    : genGenesisStateRoot({}, common)
}
