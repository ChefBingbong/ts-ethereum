export * from './gethGenesis'
export * from './presets'
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
