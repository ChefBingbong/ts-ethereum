import { EIP } from './eips'

export const EIP1_PARAMS = {
  minGasLimit: 3000n,
  gasLimitBoundDivisor: 1024n,
  maxRefundQuotient: 2n,
  targetBlobGasPerBlock: 0n,
  blobGasPerBlob: 0n,
  maxBlobGasPerBlock: 0n,
  maxExtraDataSize: 32n,

  minimumDifficulty: 1n,
  difficultyBoundDivisor: 2048n,
  durationLimit: 1n,
  difficultyBombDelay: 0n,
  minerReward: 5000000000000000000n,

  basefeeGas: 2n,
  expGas: 10n,
  expByteGas: 10n,
  keccak256Gas: 30n,
  keccak256WordGas: 6n,
  sloadGas: 50n,
  sstoreSetGas: 20000n,
  sstoreResetGas: 5000n,
  sstoreRefundGas: 15000n,
  jumpdestGas: 1n,
  logGas: 375n,
  logDataGas: 8n,
  logTopicGas: 375n,
  createGas: 32000n,
  callGas: 40n,
  callStipendGas: 2300n,
  callValueTransferGas: 9000n,
  callNewAccountGas: 25000n,
  selfdestructRefundGas: 24000n,
  memoryGas: 3n,
  quadCoefficientDivGas: 512n,
  createDataGas: 200n,
  copyGas: 3n,
  ecRecoverGas: 3000n,
  sha256Gas: 60n,
  sha256WordGas: 12n,
  ripemd160Gas: 600n,
  ripemd160WordGas: 120n,
  identityGas: 15n,
  identityWordGas: 3n,
  stopGas: 0n,
  addGas: 3n,
  mulGas: 5n,
  subGas: 3n,
  divGas: 5n,
  sdivGas: 5n,
  modGas: 5n,
  smodGas: 5n,
  addmodGas: 8n,
  mulmodGas: 8n,
  signextendGas: 5n,
  ltGas: 3n,
  gtGas: 3n,
  sltGas: 3n,
  sgtGas: 3n,
  eqGas: 3n,
  iszeroGas: 3n,
  andGas: 3n,
  orGas: 3n,
  xorGas: 3n,
  notGas: 3n,
  byteGas: 3n,
  addressGas: 2n,
  balanceGas: 20n,
  originGas: 2n,
  callerGas: 2n,
  callvalueGas: 2n,
  calldataloadGas: 3n,
  calldatasizeGas: 2n,
  calldatacopyGas: 3n,
  codesizeGas: 2n,
  codecopyGas: 3n,
  gaspriceGas: 2n,
  extcodesizeGas: 20n,
  extcodecopyGas: 20n,
  blockhashGas: 20n,
  coinbaseGas: 2n,
  timestampGas: 2n,
  numberGas: 2n,
  difficultyGas: 2n,
  gaslimitGas: 2n,
  popGas: 2n,
  mloadGas: 3n,
  mstoreGas: 3n,
  mstore8Gas: 3n,
  sstoreGas: 0n,
  jumpGas: 8n,
  jumpiGas: 10n,
  pcGas: 2n,
  msizeGas: 2n,
  gasGas: 2n,
  pushGas: 3n,
  dupGas: 3n,
  swapGas: 3n,
  callcodeGas: 40n,
  returnGas: 0n,
  invalidGas: 0n,
  selfdestructGas: 0n,
  prevrandaoGas: 0n,
  stackLimit: 1024,

  txGas: 21000n,
  txCreationGas: 32000n,
  txDataZeroGas: 4n,
  txDataNonZeroGas: 68n,
  accessListStorageKeyGas: 0n,
  accessListAddressGas: 0n,
} as const

export const EIP606_PARAMS = {
  delegatecallGas: 40n,
  difficultyBombDelay: 5000000n,
} as const

export const EIP607_PARAMS = {
  expByteGas: 50n,
  maxCodeSize: 24576,
} as const

export const EIP608_PARAMS = {
  sloadGas: 200n,
  callGas: 700n,
  extcodesizeGas: 700n,
  extcodecopyGas: 700n,
  balanceGas: 400n,
  delegatecallGas: 700n,
  callcodeGas: 700n,
  selfdestructGas: 5000n,
} as const

export const EIP609_PARAMS = {
  modexpGquaddivisorGas: 20n,
  bn254AddGas: 500n,
  bn254MulGas: 40000n,
  bn254PairingGas: 100000n,
  bn254PairingWordGas: 80000n,
  revertGas: 0n,
  staticcallGas: 700n,
  returndatasizeGas: 2n,
  returndatacopyGas: 3n,
  difficultyBombDelay: 3000000n,
  minerReward: 3000000000000000000n,
} as const

export const EIP1013_PARAMS = {
  netSstoreNoopGas: 200n,
  netSstoreInitGas: 20000n,
  netSstoreCleanGas: 5000n,
  netSstoreDirtyGas: 200n,
  netSstoreClearRefundGas: 15000n,
  netSstoreResetRefundGas: 4800n,
  netSstoreResetClearRefundGas: 19800n,
  shlGas: 3n,
  shrGas: 3n,
  sarGas: 3n,
  extcodehashGas: 400n,
  create2Gas: 32000n,
  minerReward: 2000000000000000000n,
} as const

export const EIP1679_PARAMS = {
  blake2RoundGas: 1n,
  bn254AddGas: 150n,
  bn254MulGas: 6000n,
  bn254PairingGas: 45000n,
  bn254PairingWordGas: 34000n,
  sstoreSentryEIP2200Gas: 2300n,
  sstoreNoopEIP2200Gas: 800n,
  sstoreDirtyEIP2200Gas: 800n,
  sstoreInitEIP2200Gas: 20000n,
  sstoreInitRefundEIP2200Gas: 19200n,
  sstoreCleanEIP2200Gas: 5000n,
  sstoreCleanRefundEIP2200Gas: 4200n,
  sstoreClearRefundEIP2200Gas: 15000n,
  balanceGas: 700n,
  extcodehashGas: 700n,
  chainidGas: 2n,
  selfbalanceGas: 5n,
  sloadGas: 800n,
  txDataNonZeroGas: 16n,
} as const

export const EIP1716_PARAMS = {
  netSstoreNoopGas: null,
  netSstoreInitGas: null,
  netSstoreCleanGas: null,
  netSstoreDirtyGas: null,
  netSstoreClearRefundGas: null,
  netSstoreResetRefundGas: null,
  netSstoreResetClearRefundGas: null,
} as const

export const EIP2384_PARAMS = {
  difficultyBombDelay: 9000000n,
} as const

export const EIP1559_PARAMS = {
  baseFeeMaxChangeDenominator: 8n,
  elasticityMultiplier: 2n,
  initialBaseFee: 1000000000n,
} as const

export const EIP2565_PARAMS = {
  modexpGquaddivisorGas: 3n,
} as const

export const EIP2929_PARAMS = {
  coldsloadGas: 2100n,
  coldaccountaccessGas: 2600n,
  warmstoragereadGas: 100n,
  sstoreCleanEIP2200Gas: 2900n,
  sstoreNoopEIP2200Gas: 100n,
  sstoreDirtyEIP2200Gas: 100n,
  sstoreInitRefundEIP2200Gas: 19900n,
  sstoreCleanRefundEIP2200Gas: 4900n,
  callGas: 0n,
  callcodeGas: 0n,
  delegatecallGas: 0n,
  staticcallGas: 0n,
  balanceGas: 0n,
  extcodesizeGas: 0n,
  extcodecopyGas: 0n,
  extcodehashGas: 0n,
  sloadGas: 0n,
  sstoreGas: 0n,
} as const

export const EIP2930_PARAMS = {
  accessListStorageKeyGas: 1900n,
  accessListAddressGas: 2400n,
} as const

export const EIP2935_PARAMS = {
  historyStorageAddress: 0x0000f90827f1c53a10cb7a02335b175320002935n,
  historyServeWindow: 8192n,
  systemAddress: 0xfffffffffffffffffffffffffffffffffffffffen,
} as const

export const EIP3198_PARAMS = {
  basefeeGas: 2n,
} as const

export const EIP3529_PARAMS = {
  maxRefundQuotient: 5n,
  selfdestructRefundGas: 0n,
  sstoreClearRefundEIP2200Gas: 4800n,
} as const

export const EIP3554_PARAMS = {
  difficultyBombDelay: 9500000n,
} as const

export const EIP3855_PARAMS = {
  push0Gas: 2n,
} as const

export const EIP3860_PARAMS = {
  initCodeWordGas: 2n,
  maxInitCodeSize: 49152,
} as const

export const EIP4345_PARAMS = {
  difficultyBombDelay: 10700000n,
} as const

export const EIP4399_PARAMS = {
  prevrandaoGas: 2n,
} as const

export const EIP4788_PARAMS = {
  historicalRootsLength: 8191n,
} as const

export const EIP4844_PARAMS = {
  targetBlobGasPerBlock: 393216n,
  blobGasPerBlob: 131072n,
  maxBlobGasPerBlock: 786432n,
  blobGasPriceUpdateFraction: 3338477n,
  minBlobGas: 1n,
  blobBaseCost: 8192n,
  kzgPointEvaluationPrecompileGas: 50000n,
  blobhashGas: 3n,
  blobCommitmentVersionKzg: 1,
  fieldElementsPerBlob: 4096,
} as const

export const EIP5133_PARAMS = {
  difficultyBombDelay: 11400000n,
} as const

export const EIP5656_PARAMS = {
  mcopyGas: 3n,
} as const

export const EIP663_PARAMS = {
  dupnGas: 3n,
  swapnGas: 3n,
  exchangeGas: 3n,
} as const

export const EIP1153_PARAMS = {
  tstoreGas: 100n,
  tloadGas: 100n,
} as const

export const EIP2537_PARAMS = {
  bls12381G1AddGas: 375n,
  bls12381G1MulGas: 12000n,
  bls12381G2AddGas: 600n,
  bls12381G2MulGas: 22500n,
  bls12381PairingBaseGas: 37700n,
  bls12381PairingPerPairGas: 32600n,
  bls12381MapG1Gas: 5500n,
  bls12381MapG2Gas: 23800n,
} as const

export const EIP4200_PARAMS = {
  rjumpGas: 2n,
  rjumpiGas: 4n,
  rjumpvGas: 4n,
} as const

export const EIP4750_PARAMS = {
  callfGas: 5n,
  retfGas: 3n,
} as const

export const EIP6206_PARAMS = {
  jumpfGas: 5n,
} as const

export const EIP7002_PARAMS = {
  systemAddress: 0xfffffffffffffffffffffffffffffffffffffffen,
  withdrawalRequestPredeployAddress:
    0x00000961ef480eb55e80d19ad83579a64c007002n,
} as const

export const EIP7069_PARAMS = {
  extcallGas: 0n,
  extdelegatecallGas: 0n,
  extstaticcallGas: 0n,
  returndataloadGas: 3n,
  minRetainedGas: 5000n,
  minCalleeGas: 2300n,
} as const

export const EIP7251_PARAMS = {
  systemAddress: 0xfffffffffffffffffffffffffffffffffffffffen,
  consolidationRequestPredeployAddress:
    0x0000bbddc7ce488642fb579f8b00f3a590007251n,
} as const

export const EIP7480_PARAMS = {
  dataloadGas: 4n,
  dataloadnGas: 3n,
  datasizeGas: 2n,
  datacopyGas: 3n,
} as const

export const EIP7516_PARAMS = {
  blobbasefeeGas: 2n,
} as const

export const EIP7594_PARAMS = {
  maxBlobsPerTx: 6,
} as const

export const EIP7620_PARAMS = {
  eofcreateGas: 32000n,
  returncontractGas: 0n,
} as const

export const EIP7623_PARAMS = {
  totalCostFloorPerToken: 10n,
} as const

export const EIP7691_PARAMS = {
  targetBlobGasPerBlock: 786432n,
  maxBlobGasPerBlock: 1179648n,
  blobGasPriceUpdateFraction: 5007716n,
} as const

export const EIP7702_PARAMS = {
  perAuthBaseGas: 12500n,
  perEmptyAccountCost: 25000n,
} as const

export const EIP7825_PARAMS = {
  maxTransactionGasLimit: 16777216n,
} as const

export const EIP7934_PARAMS = {
  maxRlpBlockSize: 10485760n,
} as const

export const EIP7939_PARAMS = {
  clzGas: 5n,
} as const

export const EIP_PARAMS = {
  [EIP.EIP_1]: EIP1_PARAMS,
  [EIP.EIP_606]: EIP606_PARAMS,
  [EIP.EIP_607]: EIP607_PARAMS,
  [EIP.EIP_608]: EIP608_PARAMS,
  [EIP.EIP_609]: EIP609_PARAMS,
  [EIP.EIP_1013]: EIP1013_PARAMS,
  [EIP.EIP_1679]: EIP1679_PARAMS,
  [EIP.EIP_1716]: EIP1716_PARAMS,
  [EIP.EIP_2384]: EIP2384_PARAMS,
  [EIP.EIP_1559]: EIP1559_PARAMS,
  [EIP.EIP_2565]: EIP2565_PARAMS,
  [EIP.EIP_2929]: EIP2929_PARAMS,
  [EIP.EIP_2930]: EIP2930_PARAMS,
  [EIP.EIP_2935]: EIP2935_PARAMS,
  [EIP.EIP_3198]: EIP3198_PARAMS,
  [EIP.EIP_3529]: EIP3529_PARAMS,
  [EIP.EIP_3554]: EIP3554_PARAMS,
  [EIP.EIP_3855]: EIP3855_PARAMS,
  [EIP.EIP_3860]: EIP3860_PARAMS,
  [EIP.EIP_4345]: EIP4345_PARAMS,
  [EIP.EIP_4399]: EIP4399_PARAMS,
  [EIP.EIP_4788]: EIP4788_PARAMS,
  [EIP.EIP_4844]: EIP4844_PARAMS,
  [EIP.EIP_5133]: EIP5133_PARAMS,
  [EIP.EIP_5656]: EIP5656_PARAMS,
  [EIP.EIP_663]: EIP663_PARAMS,
  [EIP.EIP_1153]: EIP1153_PARAMS,
  [EIP.EIP_2537]: EIP2537_PARAMS,
  [EIP.EIP_4200]: EIP4200_PARAMS,
  [EIP.EIP_4750]: EIP4750_PARAMS,
  [EIP.EIP_6206]: EIP6206_PARAMS,
  [EIP.EIP_7002]: EIP7002_PARAMS,
  [EIP.EIP_7069]: EIP7069_PARAMS,
  [EIP.EIP_7251]: EIP7251_PARAMS,
  [EIP.EIP_7480]: EIP7480_PARAMS,
  [EIP.EIP_7516]: EIP7516_PARAMS,
  [EIP.EIP_7594]: EIP7594_PARAMS,
  [EIP.EIP_7620]: EIP7620_PARAMS,
  [EIP.EIP_7623]: EIP7623_PARAMS,
  [EIP.EIP_7691]: EIP7691_PARAMS,
  [EIP.EIP_7702]: EIP7702_PARAMS,
  [EIP.EIP_7825]: EIP7825_PARAMS,
  [EIP.EIP_7934]: EIP7934_PARAMS,
  [EIP.EIP_7939]: EIP7939_PARAMS,
} as const

export type AllEIPParams = typeof EIP_PARAMS
export type EIPWithParams = keyof AllEIPParams

export type EIPParamsFor<E extends EIPWithParams> = AllEIPParams[E]

export type AllParamNames = {
  [K in EIPWithParams]: keyof AllEIPParams[K]
}[EIPWithParams]

export type ParamValue = bigint | number | string | null
