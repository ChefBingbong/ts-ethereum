import type { BigIntLike, KZG, PrefixedHexString } from '@ts-ethereum/utils'
import type { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import type {
  ConsensusAlgorithm,
  ConsensusType,
  Hardfork,
} from './fork-params/enums'

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

export type EthashConfig = any

// Kept for compatibility but Casper is not used
export type CasperConfig = any

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
   * String identifier ('byzantium') for hardfork or {@link Hardfork} enum.
   *
   * Default: Hardfork.Chainstart
   */
  hardfork?: string | Hardfork
  /**
   * Selected EIPs which can be activated, please use an array for instantiation
   * (e.g. `eips: [ 2537, ]`)
   *
   * Currently supported:
   *
   * - [EIP-2537](https://eips.ethereum.org/EIPS/eip-2537) - BLS12-381 precompiles
   */
  eips?: number[]
  params?: ParamsDict
  /**
   * This option can be used to replace the most common crypto primitives
   * (keccak256 hashing e.g.) within the EthereumJS ecosystem libraries
   * with alternative implementations (e.g. more performant WASM libraries).
   *
   * Note: please be aware that this is adding new dependencies for your
   * system setup to be used for sensitive/core parts of the functionality
   * and a choice on the libraries to add should be handled with care
   * and be made with eventual security implications considered.
   */
  customCrypto?: CustomCrypto
}

/**
 * Options for instantiating a {@link GlobalConfig} instance.
 */
export interface CommonOpts extends BaseOpts {
  /**
   * The chain configuration to be used. There are available configuration object for mainnet
   * (`Mainnet`) and the currently active testnets which can be directly used.
   */
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
  [key: string]: number | string | bigint | null
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

export type BpoSchedule = {
  targetBlobGasPerBlock: bigint
  maxBlobGasPerBlock: bigint
  blobGasPriceUpdateFraction: bigint
}

// ============================================================================
// EIP-Based Parameter Types (Required - no optionals)
// These types mirror the params defined in mappings.ts EIPParams
// ============================================================================

/**
 * EIP-1: Frontier/Chainstart base parameters
 */
export interface EIP1Params {
  // Gas config
  maxRefundQuotient: bigint
  minGasLimit: bigint
  gasLimitBoundDivisor: bigint
  // Opcode gas costs (all bigint - used in bigint arithmetic)
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
  // Precompile costs
  ecRecoverGas: bigint
  sha256Gas: bigint
  sha256WordGas: bigint
  ripemd160Gas: bigint
  ripemd160WordGas: bigint
  identityGas: bigint
  identityWordGas: bigint
  // Limits (number - used with Number() casts)
  stackLimit: number
  maxExtraDataSize: bigint
  // Transaction gas
  txGas: bigint
  txCreationGas: bigint
  txDataZeroGas: bigint
  txDataNonZeroGas: bigint
  accessListStorageKeyGas: bigint
  accessListAddressGas: bigint
  // PoW params
  minerReward: bigint
  minimumDifficulty: bigint
  difficultyBoundDivisor: bigint
  durationLimit: bigint
  difficultyBombDelay: bigint
}

/** EIP-606: Homestead */
export interface EIP606Params {
  delegatecallGas: bigint
}

/** EIP-608: Tangerine Whistle - Gas cost increases */
export interface EIP608Params {
  sloadGas: bigint
  callGas: bigint
  extcodesizeGas: bigint
  extcodecopyGas: bigint
  balanceGas: bigint
  delegatecallGas: bigint
  callcodeGas: bigint
  selfdestructGas: bigint
}

/** EIP-607: Spurious Dragon */
export interface EIP607Params {
  expByteGas: bigint
  maxCodeSize: number // Used with Number() cast
}

/** EIP-609: Byzantium */
export interface EIP609Params {
  modexpGquaddivisorGas: bigint
  bn254AddGas: bigint
  bn254MulGas: bigint
  bn254PairingGas: bigint
  bn254PairingWordGas: bigint
  revertGas: bigint
  staticcallGas: bigint
  returndatasizeGas: bigint
  returndatacopyGas: bigint
  difficultyBombDelay: bigint
  minerReward: bigint
}

/** EIP-1013: Constantinople */
export interface EIP1013Params {
  // Net gas metering (can be nullified by EIP-1716)
  netSstoreNoopGas: bigint | null
  netSstoreInitGas: bigint | null
  netSstoreCleanGas: bigint | null
  netSstoreDirtyGas: bigint | null
  netSstoreClearRefundGas: bigint | null
  netSstoreResetRefundGas: bigint | null
  netSstoreResetClearRefundGas: bigint | null
  // Bitwise shift opcodes
  shlGas: bigint
  shrGas: bigint
  sarGas: bigint
  extcodehashGas: bigint
  create2Gas: bigint
}

/** EIP-1679: Istanbul */
export interface EIP1679Params {
  blake2RoundGas: bigint
  sstoreSentryEIP2200Gas: bigint
  sstoreNoopEIP2200Gas: bigint
  sstoreDirtyEIP2200Gas: bigint
  sstoreInitEIP2200Gas: bigint
  sstoreInitRefundEIP2200Gas: bigint
  sstoreCleanEIP2200Gas: bigint
  sstoreCleanRefundEIP2200Gas: bigint
  sstoreClearRefundEIP2200Gas: bigint
  chainidGas: bigint
  selfbalanceGas: bigint
  txDataNonZeroGas: bigint
}

/** EIP-2384: Muir Glacier difficulty bomb delay */
export interface EIP2384Params {
  difficultyBombDelay: bigint
}

/** EIP-2565: ModExp gas cost reduction */
export interface EIP2565Params {
  modexpGquaddivisorGas: bigint
}

/** EIP-3198: BASEFEE opcode */
export interface EIP3198Params {
  basefeeGas: bigint
}

/** EIP-3554: Difficulty bomb delay to December 2021 */
export interface EIP3554Params {
  difficultyBombDelay: bigint
}

/** EIP-4345: Difficulty bomb delay to June 2022 */
export interface EIP4345Params {
  difficultyBombDelay: bigint
}

/** EIP-5133: Difficulty bomb delay to September 2022 */
export interface EIP5133Params {
  difficultyBombDelay: bigint
}

/** EIP-2929: Gas cost increases for state access opcodes */
export interface EIP2929Params {
  coldsloadGas: bigint
  coldaccountaccessGas: bigint
  warmstoragereadGas: bigint
}

/** EIP-2930: Optional access lists */
export interface EIP2930Params {
  accessListStorageKeyGas: bigint
  accessListAddressGas: bigint
}

/** EIP-1559: Fee market */
export interface EIP1559Params {
  elasticityMultiplier: bigint
  baseFeeMaxChangeDenominator: bigint
  initialBaseFee: bigint
}

/** EIP-3529: Reduction in refunds */
export interface EIP3529Params {
  maxRefundQuotient: bigint
  selfdestructRefundGas: bigint
  sstoreClearRefundEIP2200Gas: bigint
}

/** EIP-3855: PUSH0 instruction */
export interface EIP3855Params {
  push0Gas: bigint
}

/** EIP-3860: Limit and meter initcode */
export interface EIP3860Params {
  initCodeWordGas: bigint
  maxInitCodeSize: number // Used with Number() cast
}

/** EIP-4399: PREVRANDAO */
export interface EIP4399Params {
  prevrandaoGas: bigint
}

/** EIP-4788: Beacon block root in EVM */
export interface EIP4788Params {
  historicalRootsLength: bigint
}

/** EIP-4844: Shard Blob Transactions */
export interface EIP4844Params {
  kzgPointEvaluationPrecompileGas: bigint
  blobhashGas: bigint
  blobCommitmentVersionKzg: number // Version number - used with Number()
  fieldElementsPerBlob: number // Count - used as number
  targetBlobGasPerBlock: bigint
  blobGasPerBlob: bigint
  maxBlobGasPerBlock: bigint
  blobGasPriceUpdateFraction: bigint
  minBlobGas: bigint
  blobBaseCost: bigint
}

/** EIP-5656: MCOPY */
export interface EIP5656Params {
  mcopyGas: bigint
}

/** EIP-1153: Transient storage */
export interface EIP1153Params {
  tstoreGas: bigint
  tloadGas: bigint
}

/** EIP-7516: BLOBBASEFEE opcode */
export interface EIP7516Params {
  blobbasefeeGas: bigint
}

/** EIP-2537: BLS12-381 precompiles */
export interface EIP2537Params {
  bls12381G1AddGas: bigint
  bls12381G1MulGas: bigint
  bls12381G2AddGas: bigint
  bls12381G2MulGas: bigint
  bls12381PairingBaseGas: bigint
  bls12381PairingPerPairGas: bigint
  bls12381MapG1Gas: bigint
  bls12381MapG2Gas: bigint
}

/** EIP-2935: Historical block hashes in state */
export interface EIP2935Params {
  historyStorageAddress: bigint // Used with bigIntToAddressBytes
  historyServeWindow: bigint
  systemAddress: bigint // Used with createAddressFromStackBigInt
}

/** EIP-7002: Execution layer triggerable withdrawals */
export interface EIP7002Params {
  withdrawalRequestPredeployAddress: bigint // Used with bigIntToBytes
}

/** EIP-7251: Increase MAX_EFFECTIVE_BALANCE */
export interface EIP7251Params {
  consolidationRequestPredeployAddress: bigint // Used with bigIntToBytes
}

/** EIP-7623: Increase calldata cost */
export interface EIP7623Params {
  totalCostFloorPerToken: bigint
}

/** EIP-7691: Blob throughput increase */
export interface EIP7691Params {
  targetBlobGasPerBlock: bigint
  maxBlobGasPerBlock: bigint
  blobGasPriceUpdateFraction: bigint
}

/** EIP-7702: Set EOA account code */
export interface EIP7702Params {
  perAuthBaseGas: bigint
  perEmptyAccountCost: number // Used with Number() cast
}

/** EIP-7594: PeerDAS */
export interface EIP7594Params {
  maxBlobsPerTx: number // Count - used as number
}

/** EIP-7825: Transaction Gas Limit Cap */
export interface EIP7825Params {
  maxTransactionGasLimit: bigint
}

/** EIP-7939: CLZ opcode */
export interface EIP7939Params {
  clzGas: bigint
}

/** EIP-663: SWAPN, DUPN, EXCHANGE */
export interface EIP663Params {
  dupnGas: bigint
  swapnGas: bigint
  exchangeGas: bigint
}

/** EIP-4200: Static relative jumps */
export interface EIP4200Params {
  rjumpGas: bigint
  rjumpiGas: bigint
  rjumpvGas: bigint
}

/** EIP-4750: Functions */
export interface EIP4750Params {
  callfGas: bigint
  retfGas: bigint
}

/** EIP-6206: JUMPF */
export interface EIP6206Params {
  jumpfGas: bigint
}

/** EIP-7069: Revamped CALL */
export interface EIP7069Params {
  extcallGas: bigint
  extdelegatecallGas: bigint
  extstaticcallGas: bigint
  returndataloadGas: bigint
  minRetainedGas: bigint
  minCalleeGas: bigint
}

/** EIP-7480: Data section access */
export interface EIP7480Params {
  dataloadGas: bigint
  dataloadnGas: bigint
  datasizeGas: bigint
  datacopyGas: bigint
}

/** EIP-7620: EOF Contract Creation */
export interface EIP7620Params {
  eofcreateGas: bigint
  returncontractGas: bigint
}

// ============================================================================
// Combined Chain Params - Partial composition of all EIP params
// ============================================================================

/**
 * Combined chain params - union of all EIP params as Partial
 * This allows any param to be undefined when not yet activated
 */
export interface ChainParams
  extends EIP1Params,
    EIP606Params,
    EIP608Params,
    EIP607Params,
    EIP609Params,
    EIP1013Params,
    EIP1679Params,
    EIP2384Params,
    EIP2565Params,
    EIP2929Params,
    EIP2930Params,
    EIP1559Params,
    EIP3198Params,
    EIP3529Params,
    EIP3554Params,
    EIP3855Params,
    EIP3860Params,
    EIP4345Params,
    EIP4399Params,
    EIP4788Params,
    EIP4844Params,
    EIP5133Params,
    EIP5656Params,
    EIP1153Params,
    EIP7516Params,
    EIP2537Params,
    EIP2935Params,
    EIP7002Params,
    EIP7251Params,
    EIP7623Params,
    EIP7691Params,
    EIP7702Params,
    EIP7594Params,
    EIP7825Params,
    EIP7939Params,
    EIP663Params,
    EIP4200Params,
    EIP4750Params,
    EIP6206Params,
    EIP7069Params,
    EIP7480Params,
    EIP7620Params {
  // BPO schedule params (hardfork-specific)
  target?: number
  max?: number
}

/**
 * Metadata for a parameter value, tracking when/where it was activated
 */
export interface ParamMetadata {
  /** The hardfork at which this param value was set */
  activatedAtHardfork: Hardfork
  /** Block number at which hardfork was activated (null if timestamp-based) */
  activatedAtBlock: bigint | null
  /** Timestamp at which hardfork was activated (null if block-based) */
  activatedAtTimestamp: bigint | null
  /** The EIP that introduced this param */
  activatedByEIP: number
}

/**
 * EIP metadata for tracking activation status
 */
export interface EIPMetadata {
  /** Whether this EIP is currently active */
  isActive: boolean
  /** The hardfork that activated this EIP */
  activatedAtHardfork: Hardfork | null
  /** Block number at which EIP was activated */
  activatedAtBlock: bigint | null
  /** Timestamp at which EIP was activated */
  activatedAtTimestamp: bigint | null
}

/**
 * Hardfork metadata for tracking activation status
 */
export interface HardforkMetadata {
  /** Whether this hardfork is currently active */
  isActive: boolean
  /** Block number at which hardfork was activated (null if timestamp-based or not yet active) */
  activatedAtBlock: bigint | null
  /** Timestamp at which hardfork was activated (null if block-based or not yet active) */
  activatedAtTimestamp: bigint | null
}

// ============================================================================
// Hardfork-Specific Type Utilities
// ============================================================================

// All hardforks in order for reference:
// chainstart -> homestead -> dao -> tangerineWhistle -> spuriousDragon ->
// byzantium -> constantinople -> petersburg -> istanbul -> muirGlacier ->
// berlin -> london -> arrowGlacier -> grayGlacier -> mergeNetsplitBlock ->
// paris -> shanghai -> cancun -> prague -> osaka -> bpo1-5

/** Hardforks at or after Homestead (EIP-606) */
export type HomesteadAndLater = Exclude<Hardfork, 'chainstart'>

/** Hardforks at or after Tangerine Whistle (EIP-608) */
export type TangerineWhistleAndLater = Exclude<
  Hardfork,
  'chainstart' | 'homestead' | 'dao'
>

/** Hardforks at or after Spurious Dragon (EIP-607) */
export type SpuriousDragonAndLater = Exclude<
  Hardfork,
  'chainstart' | 'homestead' | 'dao' | 'tangerineWhistle'
>

/** Hardforks at or after Byzantium (EIP-609) */
export type ByzantiumAndLater = Exclude<
  Hardfork,
  'chainstart' | 'homestead' | 'dao' | 'tangerineWhistle' | 'spuriousDragon'
>

/** Hardforks at or after Constantinople (EIP-1013) */
export type ConstantinopleAndLater = Exclude<
  Hardfork,
  | 'chainstart'
  | 'homestead'
  | 'dao'
  | 'tangerineWhistle'
  | 'spuriousDragon'
  | 'byzantium'
>

/** Hardforks at or after Istanbul (EIP-1679) */
export type IstanbulAndLater = Exclude<
  Hardfork,
  | 'chainstart'
  | 'homestead'
  | 'dao'
  | 'tangerineWhistle'
  | 'spuriousDragon'
  | 'byzantium'
  | 'constantinople'
  | 'petersburg'
>

/** Hardforks at or after Berlin (EIP-2929, EIP-2930, EIP-2565) */
export type BerlinAndLater =
  | 'berlin'
  | 'london'
  | 'arrowGlacier'
  | 'grayGlacier'
  | 'mergeNetsplitBlock'
  | 'paris'
  | 'shanghai'
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after London (EIP-1559, EIP-3198, EIP-3529) */
export type LondonAndLater =
  | 'london'
  | 'arrowGlacier'
  | 'grayGlacier'
  | 'mergeNetsplitBlock'
  | 'paris'
  | 'shanghai'
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after Paris (The Merge - EIP-4399) */
export type ParisAndLater =
  | 'paris'
  | 'shanghai'
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after Shanghai (EIP-3855, EIP-3860) */
export type ShanghaiAndLater =
  | 'shanghai'
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after Cancun (EIP-4844, EIP-1153, EIP-5656, EIP-7516) */
export type CancunAndLater =
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after Prague (EIP-2537, EIP-7702, EIP-7691, etc.) */
export type PragueAndLater =
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/** Hardforks at or after Osaka (EIP-7594, EIP-7825, EIP-7939) */
export type OsakaAndLater = 'osaka' | 'bpo1' | 'bpo2' | 'bpo3' | 'bpo4' | 'bpo5'

// ============================================================================
// Hardfork-Specific Param Groups (Composed from EIP interfaces)
// These directly mirror the params in fork-params/*.ts
// ============================================================================

/** Params at Homestead+ (EIP-606) */
export type HomesteadParams = EIP606Params

/** Params at Tangerine Whistle+ (EIP-608) */
export type TangerineWhistleParams = EIP608Params

/** Params at Spurious Dragon+ (EIP-607) */
export type SpuriousDragonParams = EIP607Params

/** Params at Byzantium+ (EIP-609) */
export type ByzantiumParams = EIP609Params

/** Params at Constantinople+ (EIP-1013) */
export type ConstantinopleParams = EIP1013Params

/** Params at Istanbul+ (EIP-1679) */
export type IstanbulParams = EIP1679Params

/** Params at Berlin+ (EIP-2565, EIP-2929, EIP-2930) */
export type BerlinParams = EIP2565Params & EIP2929Params & EIP2930Params

/** Params at London+ (EIP-1559, EIP-3198, EIP-3529) */
export type LondonParams = EIP1559Params & EIP3198Params & EIP3529Params

/** Params at Paris+ (EIP-4399) */
export type ParisParams = EIP4399Params

/** Params at Shanghai+ (EIP-3855 PUSH0, EIP-3860 initcode) */
export type ShanghaiParams = EIP3855Params & EIP3860Params

/** Params at Cancun+ (EIP-4844 blobs, EIP-1153 transient, EIP-5656 MCOPY, EIP-4788, EIP-7516) */
export type CancunParams = EIP4844Params &
  EIP1153Params &
  EIP5656Params &
  EIP4788Params &
  EIP7516Params

/** Params at Prague+ (EIP-2537 BLS, EIP-7702, EIP-7691, EIP-7623, EIP-2935, EIP-7002, EIP-7251) */
export type PragueParams = EIP2537Params &
  EIP7702Params &
  EIP7691Params &
  EIP7623Params &
  EIP2935Params &
  EIP7002Params &
  EIP7251Params

/** Params at Osaka+ (EIP-7594 PeerDAS, EIP-7825 gas cap, EIP-7939 CLZ, EOF EIPs) */
export type OsakaParams = EIP7594Params &
  EIP7825Params &
  EIP7939Params &
  EIP663Params &
  EIP4200Params &
  EIP4750Params &
  EIP6206Params &
  EIP7069Params &
  EIP7480Params &
  EIP7620Params

/**
 * Merged params type that varies based on hardfork.
 * Properties that don't exist at a hardfork are completely absent (not optional).
 * Accessing unavailable params is a compile-time error.
 *
 * @example
 * ```ts
 * const builder = HardforkParamsBuilder.create(Hardfork.Cancun)
 * const params = builder.getParams()
 * params.blobGasPerBlob  // ✅ number - exists at Cancun
 * params.tstoreGas       // ✅ number - exists at Cancun
 *
 * const oldBuilder = HardforkParamsBuilder.create(Hardfork.Berlin)
 * const oldParams = oldBuilder.getParams()
 * oldParams.blobGasPerBlob  // ❌ Error: Property does not exist
 * ```
 */
export type MergedParamsAtHardfork<H extends Hardfork> =
  // Base params always available (EIP-1 Chainstart)
  EIP1Params &
    // Homestead (EIP-606)
    (H extends HomesteadAndLater ? HomesteadParams : {}) &
    // Tangerine Whistle (EIP-608)
    (H extends TangerineWhistleAndLater ? TangerineWhistleParams : {}) &
    // Spurious Dragon (EIP-607)
    (H extends SpuriousDragonAndLater ? SpuriousDragonParams : {}) &
    // Byzantium (EIP-609)
    (H extends ByzantiumAndLater ? ByzantiumParams : {}) &
    // Constantinople (EIP-1013)
    (H extends ConstantinopleAndLater ? ConstantinopleParams : {}) &
    // Istanbul (EIP-1679)
    (H extends IstanbulAndLater ? IstanbulParams : {}) &
    // Berlin (EIP-2565, EIP-2929, EIP-2930)
    (H extends BerlinAndLater ? BerlinParams : {}) &
    // London (EIP-1559, EIP-3198, EIP-3529)
    (H extends LondonAndLater ? LondonParams : {}) &
    // Paris (EIP-4399)
    (H extends ParisAndLater ? ParisParams : {}) &
    // Shanghai (EIP-3855, EIP-3860)
    (H extends ShanghaiAndLater ? ShanghaiParams : {}) &
    // Cancun (EIP-4844, EIP-1153, EIP-5656, EIP-4788, EIP-7516)
    (H extends CancunAndLater ? CancunParams : {}) &
    // Prague (EIP-2537, EIP-7702, EIP-7691, EIP-7623, EIP-2935, EIP-7002, EIP-7251)
    (H extends PragueAndLater ? PragueParams : {}) &
    // Osaka (EIP-7594, EIP-7825, EIP-7939, EOF EIPs)
    (H extends OsakaAndLater ? OsakaParams : {})
