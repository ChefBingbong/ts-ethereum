import {
  type Chain,
  ChainGenesis,
  type Common,
  type GenesisState,
} from '@ts-ethereum/chain-config'
import { genesisMPTStateRoot } from '@ts-ethereum/mpt'

export async function genGenesisStateRoot(
  genesisState: GenesisState,
  common: Common,
): Promise<Uint8Array> {
  const genCommon = common.copy()
  genCommon.setHardforkBy({
    blockNumber: 0,
    timestamp: genCommon.genesis().timestamp,
  })
  return genesisMPTStateRoot(genesisState)
}

/**
 * Returns the genesis state root if chain is well known or an empty state's root otherwise
 */
export async function getGenesisStateRoot(
  chainId: Chain,
  common: Common,
  genesisState: GenesisState,
): Promise<Uint8Array> {
  const chainGenesis = ChainGenesis[chainId]
  return chainGenesis !== undefined
    ? chainGenesis.stateRoot
    : genGenesisStateRoot(genesisState, common)
}
