import type { BigIntLike, KZG, PrefixedHexString } from '@ts-ethereum/utils'
import type { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import type { ConsensusAlgorithm, ConsensusType, Hardfork } from './enums'

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
  defaultHardfork?: string
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
 * Options for instantiating a {@link Common} instance.
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

export type BpoSchedule = {
  targetBlobGasPerBlock: bigint
  maxBlobGasPerBlock: bigint
  blobGasPriceUpdateFraction: bigint
}

// ============================================================================
// Domain-Based Parameter Types
// ============================================================================

/**
 * EVM opcode gas costs
 */
export interface OpcodeGasParams {
  // Basic operations
  stopGas?: number
  addGas?: number
  mulGas?: number
  subGas?: number
  divGas?: number
  sdivGas?: number
  modGas?: number
  smodGas?: number
  addmodGas?: number
  mulmodGas?: number
  expGas?: number
  expByteGas?: number
  signextendGas?: number

  // Comparison & bitwise
  ltGas?: number
  gtGas?: number
  sltGas?: number
  sgtGas?: number
  eqGas?: number
  iszeroGas?: number
  andGas?: number
  orGas?: number
  xorGas?: number
  notGas?: number
  byteGas?: number
  shlGas?: number
  shrGas?: number
  sarGas?: number

  // SHA3/Keccak
  keccak256Gas?: number
  keccak256WordGas?: number

  // Environment info
  addressGas?: number
  balanceGas?: number
  originGas?: number
  callerGas?: number
  callvalueGas?: number
  calldataloadGas?: number
  calldatasizeGas?: number
  calldatacopyGas?: number
  codesizeGas?: number
  codecopyGas?: number
  gaspriceGas?: number
  extcodesizeGas?: number
  extcodecopyGas?: number
  extcodehashGas?: number
  blockhashGas?: number
  coinbaseGas?: number
  timestampGas?: number
  numberGas?: number
  difficultyGas?: number
  prevrandaoGas?: number
  gaslimitGas?: number
  chainidGas?: number
  selfbalanceGas?: number
  basefeeGas?: number

  // Memory & storage
  popGas?: number
  mloadGas?: number
  mstoreGas?: number
  mstore8Gas?: number
  sloadGas?: number
  sstoreGas?: number
  sstoreSetGas?: number
  sstoreResetGas?: number
  sstoreRefundGas?: number
  memoryGas?: number
  mcopyGas?: number

  // Control flow
  jumpGas?: number
  jumpiGas?: number
  pcGas?: number
  msizeGas?: number
  gasGas?: number
  jumpdestGas?: number

  // Stack operations
  pushGas?: number
  push0Gas?: number
  dupGas?: number
  swapGas?: number

  // Log operations
  logGas?: number
  logDataGas?: number
  logTopicGas?: number

  // System operations
  createGas?: number
  create2Gas?: number
  callGas?: number
  callStipendGas?: number
  callValueTransferGas?: number
  callNewAccountGas?: number
  callcodeGas?: number
  delegatecallGas?: number
  staticcallGas?: number
  returnGas?: number
  revertGas?: number
  invalidGas?: number
  selfdestructGas?: number
  selfdestructRefundGas?: number

  // Return data
  returndatasizeGas?: number
  returndatacopyGas?: number

  // Create data gas
  createDataGas?: number
  copyGas?: number
  quadCoefficientDivGas?: number
}

/**
 * Precompile gas costs
 */
export interface PrecompileGasParams {
  // ECDSA
  ecRecoverGas?: number

  // SHA256
  sha256Gas?: number
  sha256WordGas?: number

  // RIPEMD160
  ripemd160Gas?: number
  ripemd160WordGas?: number

  // Identity
  identityGas?: number
  identityWordGas?: number

  // ModExp
  modexpGquaddivisorGas?: number

  // BN254/alt_bn128
  bn254AddGas?: number
  bn254MulGas?: number
  bn254PairingGas?: number
  bn254PairingWordGas?: number

  // Blake2
  blake2RoundGas?: number

  // BLS12-381
  bls12381G1AddGas?: number
  bls12381G1MulGas?: number
  bls12381G2AddGas?: number
  bls12381G2MulGas?: number
  bls12381PairingBaseGas?: number
  bls12381PairingPerPairGas?: number
  bls12381MapG1Gas?: number
  bls12381MapG2Gas?: number

  // KZG
  kzgPointEvaluationPrecompileGas?: number
}

/**
 * EIP-2929 cold/warm access gas costs
 */
export interface AccessGasParams {
  coldsloadGas?: number
  coldaccountaccessGas?: number
  warmstoragereadGas?: number
}

/**
 * EIP-2200 SSTORE gas costs
 */
export interface SstoreGasParams {
  // EIP-2200 (Istanbul)
  sstoreSentryEIP2200Gas?: number
  sstoreNoopEIP2200Gas?: number
  sstoreDirtyEIP2200Gas?: number
  sstoreInitEIP2200Gas?: number
  sstoreInitRefundEIP2200Gas?: number
  sstoreCleanEIP2200Gas?: number
  sstoreCleanRefundEIP2200Gas?: number
  sstoreClearRefundEIP2200Gas?: number

  // Net gas metering (EIP-1283, disabled in Petersburg)
  netSstoreNoopGas?: number | null
  netSstoreInitGas?: number | null
  netSstoreCleanGas?: number | null
  netSstoreDirtyGas?: number | null
  netSstoreClearRefundGas?: number | null
  netSstoreResetRefundGas?: number | null
  netSstoreResetClearRefundGas?: number | null
}

/**
 * EOF-related gas costs
 */
export interface EOFGasParams {
  // EIP-663: SWAPN, DUPN, EXCHANGE
  dupnGas?: number
  swapnGas?: number
  exchangeGas?: number

  // EIP-4200: Static relative jumps
  rjumpGas?: number
  rjumpiGas?: number
  rjumpvGas?: number

  // EIP-4750: Functions
  callfGas?: number
  retfGas?: number

  // EIP-6206: JUMPF
  jumpfGas?: number

  // EIP-7069: Revamped CALL
  extcallGas?: number
  extdelegatecallGas?: number
  extstaticcallGas?: number
  returndataloadGas?: number
  minRetainedGas?: number
  minCalleeGas?: number

  // EIP-7480: Data section access
  dataloadGas?: number
  dataloadnGas?: number
  datasizeGas?: number
  datacopyGas?: number

  // EIP-7620: EOF Contract Creation
  eofcreateGas?: number
  returncontractGas?: number
}

/**
 * Transient storage gas costs (EIP-1153)
 */
export interface TransientStorageGasParams {
  tstoreGas?: number
  tloadGas?: number
}

/**
 * Blob-related gas params (EIP-4844, EIP-7691)
 */
export interface BlobGasParams {
  blobhashGas?: number
  blobbasefeeGas?: number
  blobGasPerBlob?: number
  maxBlobGasPerBlock?: number
  targetBlobGasPerBlock?: number
  blobGasPriceUpdateFraction?: number
  minBlobGas?: number
  blobBaseCost?: number
  blobCommitmentVersionKzg?: number
  fieldElementsPerBlob?: number
  maxBlobsPerTx?: number
}

/**
 * Transaction gas params
 */
export interface TxGasParams {
  txGas?: number
  txCreationGas?: number
  txDataZeroGas?: number
  txDataNonZeroGas?: number
  accessListStorageKeyGas?: number
  accessListAddressGas?: number
  initCodeWordGas?: number
  totalCostFloorPerToken?: number

  // EIP-7702: EOA code delegation
  perAuthBaseGas?: number
  perEmptyAccountCost?: number
}

/**
 * Block/chain limit params
 */
export interface LimitParams {
  maxCodeSize?: number
  maxInitCodeSize?: number
  stackLimit?: number
  maxExtraDataSize?: number
  maxTransactionGasLimit?: number
}

/**
 * Gas config params
 */
export interface GasConfigParams {
  minGasLimit?: number
  gasLimitBoundDivisor?: number
  maxRefundQuotient?: number
  baseFeeMaxChangeDenominator?: number
  elasticityMultiplier?: number
  initialBaseFee?: number
}

/**
 * Proof of Work params
 */
export interface PowParams {
  minerReward?: string
  minimumDifficulty?: number
  difficultyBoundDivisor?: number
  durationLimit?: number
  difficultyBombDelay?: number
}

/**
 * System contract addresses and config
 */
export interface SystemParams {
  systemAddress?: string
  historyStorageAddress?: string
  historyServeWindow?: number
  historicalRootsLength?: number
  withdrawalRequestPredeployAddress?: string
  consolidationRequestPredeployAddress?: string
}

/**
 * EIP-7939: CLZ opcode
 */
export interface MiscOpcodeGasParams {
  clzGas?: number
}

/**
 * Combined chain params - union of all domain params
 */
export interface ChainParams
  extends OpcodeGasParams,
    PrecompileGasParams,
    AccessGasParams,
    SstoreGasParams,
    EOFGasParams,
    TransientStorageGasParams,
    BlobGasParams,
    TxGasParams,
    LimitParams,
    GasConfigParams,
    PowParams,
    SystemParams,
    MiscOpcodeGasParams {
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

/**
 * Union of hardforks at or after Berlin (EIP-2929 access lists)
 */
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

/**
 * Union of hardforks at or after London (EIP-1559 fee market)
 */
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

/**
 * Union of hardforks at or after Paris (The Merge - PoS)
 */
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

/**
 * Union of hardforks at or after Shanghai (withdrawals, PUSH0)
 */
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

/**
 * Union of hardforks at or after Cancun (blobs, transient storage)
 */
export type CancunAndLater =
  | 'cancun'
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

/**
 * Union of hardforks at or after Prague (EOF, BLS)
 */
export type PragueAndLater =
  | 'prague'
  | 'osaka'
  | 'bpo1'
  | 'bpo2'
  | 'bpo3'
  | 'bpo4'
  | 'bpo5'

// ============================================================================
// Hardfork-Specific Param Groups (Required at specific hardforks)
// ============================================================================

/**
 * Params guaranteed to exist at Berlin+ (EIP-2929)
 */
export interface BerlinParams {
  coldsloadGas: number
  coldaccountaccessGas: number
  warmstoragereadGas: number
}

/**
 * Params guaranteed to exist at London+ (EIP-1559)
 */
export interface LondonParams {
  baseFeeMaxChangeDenominator: number
  elasticityMultiplier: number
  initialBaseFee: number
}

/**
 * Params guaranteed to exist at Shanghai+ (EIP-3855 PUSH0)
 */
export interface ShanghaiParams {
  push0Gas: number
}

/**
 * Params guaranteed to exist at Cancun+ (EIP-4844 blobs, EIP-1153 transient storage)
 */
export interface CancunParams {
  // Blob params (EIP-4844)
  blobhashGas: number
  blobGasPerBlob: number
  maxBlobGasPerBlock: number
  targetBlobGasPerBlock: number
  blobGasPriceUpdateFraction: number
  // Transient storage (EIP-1153)
  tstoreGas: number
  tloadGas: number
  // MCOPY (EIP-5656)
  mcopyGas: number
}

/**
 * Merged params type that varies based on hardfork.
 * Returns ChainParams intersected with guaranteed params for that hardfork.
 *
 * @example
 * ```ts
 * // At Cancun, blob params are guaranteed to exist
 * const builder = HardforkParamsBuilder.create(Hardfork.Cancun)
 * const params = builder.getParams()
 * params.blobGasPerBlob // number (not number | undefined)
 * ```
 */
export type MergedParamsAtHardfork<H extends Hardfork> = ChainParams &
  (H extends BerlinAndLater ? BerlinParams : unknown) &
  (H extends LondonAndLater ? LondonParams : unknown) &
  (H extends ShanghaiAndLater ? ShanghaiParams : unknown) &
  (H extends CancunAndLater ? CancunParams : unknown)
