import { Holesky, Hoodi, Mainnet, Sepolia } from './presets'

export * from './presets'
export * from './schema'

export const getPresetChainConfig = (chain: string | number) => {
  switch (chain) {
    case 'holesky':
    case 17000:
      return Holesky
    case 'hoodi':
    case 560048:
      return Hoodi
    case 'sepolia':
    case 11155111:
      return Sepolia
    default:
      return Mainnet
  }
}

export enum ConsensusAlgorithm {
  Ethash = 'ethash',
  Clique = 'clique',
  Casper = 'casper',
}

export enum ConsensusType {
  ProofOfWork = 'pow',
  ProofOfAuthority = 'poa',
  ProofOfStake = 'pos',
}
