import type { PrefixedHexString } from '@ts-ethereum/utils'
import type { ConsensusConfig } from '../types'

export type ConfigHardfork =
  | { name: string; block: null; timestamp: number }
  | { name: string; block: bigint; timestamp?: number }

export interface GethGenesisConfig {
  chainId: number
  depositContractAddress?: string
  homesteadBlock?: number
  daoForkBlock?: number
  daoForkSupport?: boolean
  eip150Block?: number
  eip150Hash?: string
  eip155Block?: number
  eip158Block?: number
  byzantiumBlock?: number
  constantinopleBlock?: number
  petersburgBlock?: number
  istanbulBlock?: number
  muirGlacierBlock?: number
  berlinBlock?: number
  londonBlock?: number
  mergeForkBlock?: number
  cancunBlock?: number
  arrowGlacierBlock?: number
  grayGlacierBlock?: number
  mergeNetsplitBlock?: number
  shanghaiTime?: number
  cancunTime?: number
  pragueTime?: number
  terminalTotalDifficulty?: number
  terminalTotalDifficultyPassed?: boolean
  ethash?: {}
  clique?: {
    period?: number
    epoch?: number
    blockperiodseconds?: number
    epochlength?: number
  }
  trustedCheckpoint?: {
    sectionIndex: number
    sectionHead: string
    chtRoot: string
    bloomRoot: string
  }
  trustedCheckpointOracle?: {
    address: string
    signers: string[]
    threshold: number
  }
  blobSchedule?: GethGenesisBlobSchedule
  proofInBlocks?: boolean
}

export interface GethGenesisAlloc {
  [address: string]: {
    balance: string
    code?: string
    storage?: { [key: string]: string }
    nonce?: string
  }
}

export interface GethGenesisBlobSchedule {
  [fork: string]: {
    target?: number
    max?: number
    baseFeeUpdateFraction?: number
  }
}

export interface GethGenesis {
  config: GethGenesisConfig
  name: string
  excessBlobGas?: PrefixedHexString
  requestsHash?: PrefixedHexString
  nonce: PrefixedHexString
  timestamp?: PrefixedHexString
  extraData?: PrefixedHexString
  gasLimit: PrefixedHexString | number
  difficulty?: PrefixedHexString
  mixHash?: PrefixedHexString
  coinbase?: PrefixedHexString
  alloc?: GethGenesisAlloc
  number?: PrefixedHexString
  gasUsed?: PrefixedHexString
  parentHash?: PrefixedHexString
  consensus?: ConsensusConfig
  baseFeePerGas?: PrefixedHexString | number | null
}

export interface CreateCommonFromGethGenesisOpts {
  chain?: string
  genesisHash?: string
  mergeForkIdPostMerge?: boolean
}

export type StoragePair = [key: PrefixedHexString, value: PrefixedHexString]

export type AccountState = [
  balance: PrefixedHexString,
  code?: PrefixedHexString,
  storage?: Array<StoragePair>,
  nonce?: PrefixedHexString,
]

export interface GenesisState {
  [key: PrefixedHexString]: PrefixedHexString | AccountState
}
