import type { Common, GenesisState } from '@ts-ethereum/chain-config'
import { genesisMPTStateRoot } from '@ts-ethereum/mpt'

export async function genGenesisStateRoot(
  genesisState: GenesisState,
): Promise<Uint8Array> {
  return genesisMPTStateRoot(genesisState)
}

export async function getGenesisStateRoot(common: Common): Promise<Uint8Array> {
  return genGenesisStateRoot({
    name: common.chainName(),
    blockNumber: 0n,
    stateRoot: new Uint8Array(32),
  })
}
