import { holeskyGenesis } from './genesisStates/holesky.js'
import { hoodiGenesis } from './genesisStates/hoodi.js'
import { mainnetGenesis } from './genesisStates/mainnet.js'
import { sepoliaGenesis } from './genesisStates/sepolia.js'
import type { GenesisState } from './types.js'

export type Chain = (typeof Chain)[keyof typeof Chain]

export const Chain = {
  Mainnet: 1,
  Sepolia: 11155111,
  Holesky: 17000,
  Hoodi: 560048,
} as const

export function getGenesis(chainId: number): GenesisState | undefined {
  switch (chainId) {
    case Chain.Mainnet:
      return mainnetGenesis
    case Chain.Sepolia:
      return sepoliaGenesis
    case Chain.Holesky:
      return holeskyGenesis
    case Chain.Hoodi:
      return hoodiGenesis

    default:
      return undefined
  }
}

export * from './gethGenesis'
export * from './types'
