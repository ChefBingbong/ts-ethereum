import type { BigIntLike, KZG, PrefixedHexString } from '@ts-ethereum/utils'
import type { secp256k1 } from 'ethereum-cryptography/secp256k1.js'

export interface ChainName {
  [chainId: string]: string
}
export interface ChainsConfig {
  [key: string]: ChainConfig | ChainName
}

export interface CommonEvent {
  hardforkChanged: [hardfork: string]
}

// Kept for compatibility but Clique is not used
export type CliqueConfig = {
  period: number
  epoch: number
}

export type EthashConfig = {}

// Kept for compatibility but Casper is not used
export type CasperConfig = {}

type ConsensusConfig = {
  type: ConsensusType | string
  algorithm: ConsensusAlgorithm | string
  clique?: CliqueConfig
  ethash?: EthashConfig
  casper?: CasperConfig
}

export interface ChainConfig {
  name: string
  chainId: number | string
  defaultHardfork?: string
  genesis: GenesisBlockConfig
  hardforks: HardforkTransitionConfig[]
  bootstrapNodes: BootstrapNodeConfig[]
  consensus: ConsensusConfig
}

export interface GenesisBlockConfig {
  timestamp?: PrefixedHexString
  gasLimit: number | PrefixedHexString
  difficulty: number | PrefixedHexString
  nonce: PrefixedHexString
  extraData: PrefixedHexString
}

export interface HardforkTransitionConfig {
  name: Hardfork | string
  block: number | null
  timestamp?: number | string
  forkHash?: PrefixedHexString | null
}

export interface BootstrapNodeConfig {
  ip: string
  port: number | string
  network?: string
  chainId?: number
  id: string
  location: string
  comment: string
}

export interface CustomCrypto {
  keccak256?: (msg: Uint8Array) => Uint8Array
  ecrecover?: (
    msgHash: Uint8Array,
    v: bigint,
    r: Uint8Array,
    s: Uint8Array,
    chainId?: bigint,
  ) => Uint8Array
  sha256?: (msg: Uint8Array) => Uint8Array
  ecsign?: (
    msg: Uint8Array,
    pk: Uint8Array,
    ecSignOpts?: { extraEntropy?: Uint8Array | boolean },
  ) => Pick<ReturnType<typeof secp256k1.sign>, 'recovery' | 'r' | 's'>
  ecdsaRecover?: (
    sig: Uint8Array,
    recId: number,
    hash: Uint8Array,
  ) => Uint8Array
  kzg?: KZG
}

export interface BaseOpts {
  /**
   * String identifier ('chainstart') for hardfork or {@link Hardfork} enum.
   * Only Chainstart is supported.
   */
  hardfork?: string | Hardfork
  params: ParamsConfig
}

/**
 * Options for instantiating a {@link Common} instance.
 */
export interface CommonOpts extends BaseOpts {
  chain: ChainConfig
}

export interface GethConfigOpts extends BaseOpts {
  chain?: string
  genesisHash?: Uint8Array
}

export interface HardforkByOpts {
  blockNumber?: BigIntLike
  timestamp?: BigIntLike
}

export type EIPConfig = {
  minimumHardfork: Hardfork
  requiredEIPs?: number[]
}

export type ParamsConfig = {
  [key: string]: number | string | null
}

export type HardforkConfig = {
  eips?: number[]
  consensus?: ConsensusConfig
  params?: ParamsConfig
}

export type EIPsDict = {
  [key: string]: EIPConfig
}

export type ParamsDict = {
  [key: string]: ParamsConfig
}

export type HardforksDict = {
  [key: string]: HardforkConfig
}

export type Chain = (typeof Chain)[keyof typeof Chain]
// Only Chainstart hardfork - no EIPs, no other hardforks
export type Hardfork = (typeof Hardfork)[keyof typeof Hardfork]

export const Hardfork = {
  Chainstart: 'chainstart',
} as const

// Only PoW consensus
export type ConsensusType = (typeof ConsensusType)[keyof typeof ConsensusType]

export const ConsensusType = {
  ProofOfWork: 'pow',
} as const

// Only Ethash algorithm
export type ConsensusAlgorithm =
  (typeof ConsensusAlgorithm)[keyof typeof ConsensusAlgorithm]

export const ConsensusAlgorithm = {
  Ethash: 'ethash',
} as const

export const Chain = {
  Mainnet: 1,
  Sepolia: 11155111,
  Holesky: 17000,
  Hoodi: 560048,
} as const
export type GenesisState = {
  name: string
  /* blockNumber that can be used to update and track the regenesis marker */
  blockNumber: bigint
  /* stateRoot of the chain at the blockNumber */
  stateRoot: Uint8Array
}
