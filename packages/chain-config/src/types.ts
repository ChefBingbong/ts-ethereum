import type { BigIntLike, KZG, PrefixedHexString } from '@ts-ethereum/utils'
import type { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import type { ConsensusAlgorithm, ConsensusType } from './chains'
import type { Hardfork } from './hardforks'

export type Chain = any

export interface CommonEvent {
  hardforkChanged: [hardfork: string]
}

export type CliqueConfig = {
  period: number
  epoch: number
}

export type EthashConfig = any

export type CasperConfig = any

export type ConsensusConfig = {
  type: ConsensusType | string
  algorithm: ConsensusAlgorithm | string
  clique?: CliqueConfig
  ethash?: EthashConfig
  casper?: CasperConfig
}

export interface ChainConfig {
  name: string
  chainId: bigint
  defaultHardfork?: Hardfork
  comment?: string
  url?: string
  genesis: GenesisBlockConfig
  hardforks: HardforkTransitionConfig[]
  customHardforks?: HardforksDict
  bootstrapNodes: BootstrapNodeConfig[]
  dnsNetworks?: string[]
  consensus: ConsensusConfig
  depositContractAddress?: PrefixedHexString
}

export interface GenesisBlockConfig {
  timestamp?: PrefixedHexString
  gasLimit: number | PrefixedHexString
  difficulty: number | PrefixedHexString
  nonce: PrefixedHexString
  extraData: PrefixedHexString
  baseFeePerGas?: PrefixedHexString
  excessBlobGas?: PrefixedHexString
  requestsHash?: PrefixedHexString
}

export interface HardforkTransitionConfig {
  name: Hardfork | string
  block: bigint | null
  timestamp?: number | string
  forkHash?: PrefixedHexString | null
  optional?: boolean
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
  hardfork?: string | Hardfork
  eips?: number[]
  params?: ParamsDict
  customCrypto?: CustomCrypto
}

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

export type ParamsConfig = {
  [key: string]: number | string | bigint | null
}

export type HardforkConfig = {
  eips?: number[]
  consensus?: ConsensusConfig
  params?: ParamsConfig
}

export type ParamsDict = {
  [key: string]: ParamsConfig
}

export type HardforksDict = {
  [key: string]: HardforkConfig
}

export type BpoSchedule = {
  targetBlobGasPerBlock: bigint
  maxBlobGasPerBlock: bigint
  blobGasPriceUpdateFraction: bigint
}

export interface ChainParams {
  minGasLimit: bigint
  gasLimitBoundDivisor: bigint
  maxRefundQuotient: bigint
  targetBlobGasPerBlock: bigint
  blobGasPerBlob: bigint
  maxBlobGasPerBlock: bigint
  maxExtraDataSize: bigint
  minimumDifficulty: bigint
  difficultyBoundDivisor: bigint
  durationLimit: bigint
  difficultyBombDelay: bigint
  minerReward: bigint
  basefeeGas: bigint
  expGas: bigint
  expByteGas: bigint
  keccak256Gas: bigint
  keccak256WordGas: bigint
  sloadGas: bigint
  sstoreSetGas: bigint
  sstoreResetGas: bigint
  sstoreRefundGas: bigint
  jumpdestGas: bigint
  logGas: bigint
  logDataGas: bigint
  logTopicGas: bigint
  createGas: bigint
  callGas: bigint
  callStipendGas: bigint
  callValueTransferGas: bigint
  callNewAccountGas: bigint
  selfdestructRefundGas: bigint
  memoryGas: bigint
  quadCoefficientDivGas: bigint
  createDataGas: bigint
  copyGas: bigint
  ecRecoverGas: bigint
  sha256Gas: bigint
  sha256WordGas: bigint
  ripemd160Gas: bigint
  ripemd160WordGas: bigint
  identityGas: bigint
  identityWordGas: bigint
  stopGas: bigint
  addGas: bigint
  mulGas: bigint
  subGas: bigint
  divGas: bigint
  sdivGas: bigint
  modGas: bigint
  smodGas: bigint
  addmodGas: bigint
  mulmodGas: bigint
  signextendGas: bigint
  ltGas: bigint
  gtGas: bigint
  sltGas: bigint
  sgtGas: bigint
  eqGas: bigint
  iszeroGas: bigint
  andGas: bigint
  orGas: bigint
  xorGas: bigint
  notGas: bigint
  byteGas: bigint
  addressGas: bigint
  balanceGas: bigint
  originGas: bigint
  callerGas: bigint
  callvalueGas: bigint
  calldataloadGas: bigint
  calldatasizeGas: bigint
  calldatacopyGas: bigint
  codesizeGas: bigint
  codecopyGas: bigint
  gaspriceGas: bigint
  extcodesizeGas: bigint
  extcodecopyGas: bigint
  blockhashGas: bigint
  coinbaseGas: bigint
  timestampGas: bigint
  numberGas: bigint
  difficultyGas: bigint
  gaslimitGas: bigint
  popGas: bigint
  mloadGas: bigint
  mstoreGas: bigint
  mstore8Gas: bigint
  sstoreGas: bigint
  jumpGas: bigint
  jumpiGas: bigint
  pcGas: bigint
  msizeGas: bigint
  gasGas: bigint
  pushGas: bigint
  dupGas: bigint
  swapGas: bigint
  callcodeGas: bigint
  returnGas: bigint
  invalidGas: bigint
  selfdestructGas: bigint
  prevrandaoGas: bigint
  stackLimit: number
  txGas: bigint
  txCreationGas: bigint
  txDataZeroGas: bigint
  txDataNonZeroGas: bigint
  accessListStorageKeyGas: bigint
  accessListAddressGas: bigint

  baseFeeMaxChangeDenominator?: bigint
  elasticityMultiplier?: bigint
  initialBaseFee?: bigint

  blobGasPriceUpdateFraction?: bigint
  minBlobGas?: bigint
  blobBaseCost?: bigint
  kzgPointEvaluationPrecompileGas?: bigint
  blobhashGas?: bigint
  blobCommitmentVersionKzg?: number
  fieldElementsPerBlob?: number

  delegatecallGas?: bigint
  maxCodeSize?: number
  modexpGquaddivisorGas?: bigint
  bn254AddGas?: bigint
  bn254MulGas?: bigint
  bn254PairingGas?: bigint
  bn254PairingWordGas?: bigint
  revertGas?: bigint
  staticcallGas?: bigint
  returndatasizeGas?: bigint
  returndatacopyGas?: bigint
  extcodehashGas?: bigint
  create2Gas?: bigint
  chainidGas?: bigint
  selfbalanceGas?: bigint
  push0Gas?: bigint
  initCodeWordGas?: bigint
  maxInitCodeSize?: number
  coldsloadGas?: bigint
  coldaccountaccessGas?: bigint
  warmstoragereadGas?: bigint
  mcopyGas?: bigint
  tstoreGas?: bigint
  tloadGas?: bigint
  blobbasefeeGas?: bigint
  historicalRootsLength?: bigint
  historyStorageAddress?: bigint
  historyServeWindow?: bigint
  systemAddress?: bigint
  withdrawalRequestPredeployAddress?: bigint
  consolidationRequestPredeployAddress?: bigint
  totalCostFloorPerToken?: bigint
  perAuthBaseGas?: bigint
  perEmptyAccountCost?: bigint
  maxTransactionGasLimit?: bigint
  maxRlpBlockSize?: bigint
  clzGas?: bigint

  target?: number
  max?: number

  [key: string]: bigint | number | string | null | undefined
}
