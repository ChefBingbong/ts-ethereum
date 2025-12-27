/**
 * Static mappings for hardforks to EIPs and EIP params
 *
 * This module provides:
 * - HardforkEIPs: Direct mapping of which EIPs are introduced by each hardfork
 * - CumulativeHardforkEIPs: Computed cumulative EIPs active at each hardfork
 * - EIPParams: Parameter changes introduced by each EIP
 */

import { EIP, Hardfork } from './enums'
import type { ChainParams } from './types'

export const EIPParams = {
  // -------------------------------------------------------------------------
  // EIP-1: Frontier/Chainstart - Base parameters
  // -------------------------------------------------------------------------
  [EIP.EIP_1]: {
    // Gas config
    maxRefundQuotient: 2,
    minGasLimit: 3000,
    gasLimitBoundDivisor: 1024,

    // Opcode gas costs
    basefeeGas: 2,
    expGas: 10,
    expByteGas: 10,
    keccak256Gas: 30,
    keccak256WordGas: 6,
    sloadGas: 50,
    sstoreSetGas: 20000,
    sstoreResetGas: 5000,
    sstoreRefundGas: 15000,
    jumpdestGas: 1,
    logGas: 375,
    logDataGas: 8,
    logTopicGas: 375,
    createGas: 32000,
    callGas: 40,
    callStipendGas: 2300,
    callValueTransferGas: 9000,
    callNewAccountGas: 25000,
    selfdestructRefundGas: 24000,
    memoryGas: 3,
    quadCoefficientDivGas: 512,
    createDataGas: 200,
    copyGas: 3,
    stopGas: 0,
    addGas: 3,
    mulGas: 5,
    subGas: 3,
    divGas: 5,
    sdivGas: 5,
    modGas: 5,
    smodGas: 5,
    addmodGas: 8,
    mulmodGas: 8,
    signextendGas: 5,
    ltGas: 3,
    gtGas: 3,
    sltGas: 3,
    sgtGas: 3,
    eqGas: 3,
    iszeroGas: 3,
    andGas: 3,
    orGas: 3,
    xorGas: 3,
    notGas: 3,
    byteGas: 3,
    addressGas: 2,
    balanceGas: 20,
    originGas: 2,
    callerGas: 2,
    callvalueGas: 2,
    calldataloadGas: 3,
    calldatasizeGas: 2,
    calldatacopyGas: 3,
    codesizeGas: 2,
    codecopyGas: 3,
    gaspriceGas: 2,
    extcodesizeGas: 20,
    extcodecopyGas: 20,
    blockhashGas: 20,
    coinbaseGas: 2,
    timestampGas: 2,
    numberGas: 2,
    difficultyGas: 2,
    gaslimitGas: 2,
    popGas: 2,
    mloadGas: 3,
    mstoreGas: 3,
    mstore8Gas: 3,
    sstoreGas: 0,
    jumpGas: 8,
    jumpiGas: 10,
    pcGas: 2,
    msizeGas: 2,
    gasGas: 2,
    pushGas: 3,
    dupGas: 3,
    swapGas: 3,
    callcodeGas: 40,
    returnGas: 0,
    invalidGas: 0,
    selfdestructGas: 0,
    prevrandaoGas: 0,

    // Precompile costs
    ecRecoverGas: 3000,
    sha256Gas: 60,
    sha256WordGas: 12,
    ripemd160Gas: 600,
    ripemd160WordGas: 120,
    identityGas: 15,
    identityWordGas: 3,

    // Limits
    stackLimit: 1024,
    maxExtraDataSize: 32,

    // Transaction gas
    txGas: 21000,
    txCreationGas: 32000,
    txDataZeroGas: 4,
    txDataNonZeroGas: 68,
    accessListStorageKeyGas: 0,
    accessListAddressGas: 0,

    // PoW params
    minerReward: '5000000000000000000',
    minimumDifficulty: 10,
    difficultyBoundDivisor: 2048,
    durationLimit: 4,
    difficultyBombDelay: 0,
  },

  // -------------------------------------------------------------------------
  // EIP-606: Homestead
  // -------------------------------------------------------------------------
  [EIP.EIP_606]: {
    delegatecallGas: 40,
  },

  // -------------------------------------------------------------------------
  // EIP-608: Tangerine Whistle
  // -------------------------------------------------------------------------
  [EIP.EIP_608]: {
    sloadGas: 200,
    callGas: 700,
    extcodesizeGas: 700,
    extcodecopyGas: 700,
    balanceGas: 400,
    delegatecallGas: 700,
    callcodeGas: 700,
    selfdestructGas: 5000,
  },

  // -------------------------------------------------------------------------
  // EIP-607: Spurious Dragon
  // -------------------------------------------------------------------------
  [EIP.EIP_607]: {
    expByteGas: 50,
    maxCodeSize: 24576,
  },

  // -------------------------------------------------------------------------
  // EIP-609: Byzantium
  // -------------------------------------------------------------------------
  [EIP.EIP_609]: {
    modexpGquaddivisorGas: 20,
    bn254AddGas: 500,
    bn254MulGas: 40000,
    bn254PairingGas: 100000,
    bn254PairingWordGas: 80000,
    revertGas: 0,
    staticcallGas: 700,
    returndatasizeGas: 2,
    returndatacopyGas: 3,
    difficultyBombDelay: 3000000,
    minerReward: '3000000000000000000',
  },

  // -------------------------------------------------------------------------
  // EIP-1013: Constantinople
  // -------------------------------------------------------------------------
  [EIP.EIP_1013]: {
    netSstoreNoopGas: 200,
    netSstoreInitGas: 20000,
    netSstoreCleanGas: 5000,
    netSstoreDirtyGas: 200,
    netSstoreClearRefundGas: 15000,
    netSstoreResetRefundGas: 4800,
    netSstoreResetClearRefundGas: 19800,
    shlGas: 3,
    shrGas: 3,
    sarGas: 3,
    extcodehashGas: 400,
    create2Gas: 32000,
    difficultyBombDelay: 5000000,
    minerReward: '2000000000000000000',
  },

  // -------------------------------------------------------------------------
  // EIP-1716: Petersburg (removes EIP-1283)
  // -------------------------------------------------------------------------
  [EIP.EIP_1716]: {
    netSstoreNoopGas: null,
    netSstoreInitGas: null,
    netSstoreCleanGas: null,
    netSstoreDirtyGas: null,
    netSstoreClearRefundGas: null,
    netSstoreResetRefundGas: null,
    netSstoreResetClearRefundGas: null,
  },

  // -------------------------------------------------------------------------
  // EIP-1679: Istanbul
  // -------------------------------------------------------------------------
  [EIP.EIP_1679]: {
    blake2RoundGas: 1,
    bn254AddGas: 150,
    bn254MulGas: 6000,
    bn254PairingGas: 45000,
    bn254PairingWordGas: 34000,
    sstoreSentryEIP2200Gas: 2300,
    sstoreNoopEIP2200Gas: 800,
    sstoreDirtyEIP2200Gas: 800,
    sstoreInitEIP2200Gas: 20000,
    sstoreInitRefundEIP2200Gas: 19200,
    sstoreCleanEIP2200Gas: 5000,
    sstoreCleanRefundEIP2200Gas: 4200,
    sstoreClearRefundEIP2200Gas: 15000,
    balanceGas: 700,
    extcodehashGas: 700,
    chainidGas: 2,
    selfbalanceGas: 5,
    sloadGas: 800,
    txDataNonZeroGas: 16,
  },

  // -------------------------------------------------------------------------
  // EIP-2384: Muir Glacier
  // -------------------------------------------------------------------------
  [EIP.EIP_2384]: {
    difficultyBombDelay: 9000000,
  },

  // -------------------------------------------------------------------------
  // EIP-2565: ModExp gas cost
  // -------------------------------------------------------------------------
  [EIP.EIP_2565]: {
    modexpGquaddivisorGas: 3,
  },

  // -------------------------------------------------------------------------
  // EIP-2929: Gas cost increases for state access opcodes
  // -------------------------------------------------------------------------
  [EIP.EIP_2929]: {
    coldsloadGas: 2100,
    coldaccountaccessGas: 2600,
    warmstoragereadGas: 100,
    sstoreCleanEIP2200Gas: 2900,
    sstoreNoopEIP2200Gas: 100,
    sstoreDirtyEIP2200Gas: 100,
    sstoreInitRefundEIP2200Gas: 19900,
    sstoreCleanRefundEIP2200Gas: 4900,
    callGas: 0,
    callcodeGas: 0,
    delegatecallGas: 0,
    staticcallGas: 0,
    balanceGas: 0,
    extcodesizeGas: 0,
    extcodecopyGas: 0,
    extcodehashGas: 0,
    sloadGas: 0,
    sstoreGas: 0,
  },

  // -------------------------------------------------------------------------
  // EIP-2930: Optional access lists
  // -------------------------------------------------------------------------
  [EIP.EIP_2930]: {
    accessListStorageKeyGas: 1900,
    accessListAddressGas: 2400,
  },

  // -------------------------------------------------------------------------
  // EIP-2935: Historical block hashes in state
  // -------------------------------------------------------------------------
  [EIP.EIP_2935]: {
    historyStorageAddress: '0x0000F90827F1C53A10CB7A02335B175320002935',
    historyServeWindow: 8192,
    systemAddress: '0xfffffffffffffffffffffffffffffffffffffffe',
  },

  // -------------------------------------------------------------------------
  // EIP-1559: Fee market
  // -------------------------------------------------------------------------
  [EIP.EIP_1559]: {
    elasticityMultiplier: 2,
    baseFeeMaxChangeDenominator: 8,
    initialBaseFee: 1000000000,
  },

  // -------------------------------------------------------------------------
  // EIP-3198: BASEFEE opcode
  // -------------------------------------------------------------------------
  [EIP.EIP_3198]: {
    basefeeGas: 2,
  },

  // -------------------------------------------------------------------------
  // EIP-3529: Reduction in refunds
  // -------------------------------------------------------------------------
  [EIP.EIP_3529]: {
    maxRefundQuotient: 5,
    selfdestructRefundGas: 0,
    sstoreClearRefundEIP2200Gas: 4800,
  },

  // -------------------------------------------------------------------------
  // EIP-3554: Difficulty Bomb Delay to December 2021
  // -------------------------------------------------------------------------
  [EIP.EIP_3554]: {
    difficultyBombDelay: 9500000,
  },

  // -------------------------------------------------------------------------
  // EIP-3651: Warm COINBASE
  // -------------------------------------------------------------------------
  [EIP.EIP_3651]: {
    // Coinbase is pre-warmed, no gas param changes needed
  },

  // -------------------------------------------------------------------------
  // EIP-3855: PUSH0 instruction
  // -------------------------------------------------------------------------
  [EIP.EIP_3855]: {
    push0Gas: 2,
  },

  // -------------------------------------------------------------------------
  // EIP-3860: Limit and meter initcode
  // -------------------------------------------------------------------------
  [EIP.EIP_3860]: {
    initCodeWordGas: 2,
    maxInitCodeSize: 49152,
  },

  // -------------------------------------------------------------------------
  // EIP-4345: Difficulty Bomb Delay to June 2022
  // -------------------------------------------------------------------------
  [EIP.EIP_4345]: {
    difficultyBombDelay: 10700000,
  },

  // -------------------------------------------------------------------------
  // EIP-4399: PREVRANDAO
  // -------------------------------------------------------------------------
  [EIP.EIP_4399]: {
    prevrandaoGas: 2,
  },

  // -------------------------------------------------------------------------
  // EIP-4788: Beacon block root in EVM
  // -------------------------------------------------------------------------
  [EIP.EIP_4788]: {
    historicalRootsLength: 8191,
  },

  // -------------------------------------------------------------------------
  // EIP-4844: Shard Blob Transactions
  // -------------------------------------------------------------------------
  [EIP.EIP_4844]: {
    kzgPointEvaluationPrecompileGas: 50000,
    blobhashGas: 3,
    blobCommitmentVersionKzg: 1,
    fieldElementsPerBlob: 4096,
    targetBlobGasPerBlock: 393216,
    blobGasPerBlob: 131072,
    maxBlobGasPerBlock: 786432,
    blobGasPriceUpdateFraction: 3338477,
    minBlobGas: 1,
    blobBaseCost: 8192,
  },

  // -------------------------------------------------------------------------
  // EIP-5133: Difficulty Bomb Delay to September 2022
  // -------------------------------------------------------------------------
  [EIP.EIP_5133]: {
    difficultyBombDelay: 11400000,
  },

  // -------------------------------------------------------------------------
  // EIP-5656: MCOPY
  // -------------------------------------------------------------------------
  [EIP.EIP_5656]: {
    mcopyGas: 3,
  },

  // -------------------------------------------------------------------------
  // EIP-1153: Transient storage
  // -------------------------------------------------------------------------
  [EIP.EIP_1153]: {
    tstoreGas: 100,
    tloadGas: 100,
  },

  // -------------------------------------------------------------------------
  // EIP-6780: SELFDESTRUCT only in same transaction
  // -------------------------------------------------------------------------
  [EIP.EIP_6780]: {
    // No gas param changes, just behavior change
  },

  // -------------------------------------------------------------------------
  // EIP-7516: BLOBBASEFEE opcode
  // -------------------------------------------------------------------------
  [EIP.EIP_7516]: {
    blobbasefeeGas: 2,
  },

  // -------------------------------------------------------------------------
  // EIP-2537: BLS12-381 precompiles
  // -------------------------------------------------------------------------
  [EIP.EIP_2537]: {
    bls12381G1AddGas: 375,
    bls12381G1MulGas: 12000,
    bls12381G2AddGas: 600,
    bls12381G2MulGas: 22500,
    bls12381PairingBaseGas: 37700,
    bls12381PairingPerPairGas: 32600,
    bls12381MapG1Gas: 5500,
    bls12381MapG2Gas: 23800,
  },

  // -------------------------------------------------------------------------
  // EIP-7002: Execution layer triggerable withdrawals
  // -------------------------------------------------------------------------
  [EIP.EIP_7002]: {
    withdrawalRequestPredeployAddress:
      '0x00000961EF480EB55E80D19AD83579A64C007002',
  },

  // -------------------------------------------------------------------------
  // EIP-7251: Increase MAX_EFFECTIVE_BALANCE
  // -------------------------------------------------------------------------
  [EIP.EIP_7251]: {
    consolidationRequestPredeployAddress:
      '0x0000BBDDC7CE488642FB579F8B00F3A590007251',
  },

  // -------------------------------------------------------------------------
  // EIP-7623: Increase calldata cost
  // -------------------------------------------------------------------------
  [EIP.EIP_7623]: {
    totalCostFloorPerToken: 10,
  },

  // -------------------------------------------------------------------------
  // EIP-7691: Blob throughput increase
  // -------------------------------------------------------------------------
  [EIP.EIP_7691]: {
    targetBlobGasPerBlock: 786432,
    maxBlobGasPerBlock: 1179648,
    blobGasPriceUpdateFraction: 5007716,
  },

  // -------------------------------------------------------------------------
  // EIP-7702: Set EOA account code
  // -------------------------------------------------------------------------
  [EIP.EIP_7702]: {
    perAuthBaseGas: 12500,
    perEmptyAccountCost: 25000,
  },

  // -------------------------------------------------------------------------
  // EIP-7594: PeerDAS
  // -------------------------------------------------------------------------
  [EIP.EIP_7594]: {
    maxBlobsPerTx: 6,
  },

  // -------------------------------------------------------------------------
  // EIP-7825: Transaction Gas Limit Cap
  // -------------------------------------------------------------------------
  [EIP.EIP_7825]: {
    maxTransactionGasLimit: 16777216,
  },

  // -------------------------------------------------------------------------
  // EIP-7939: CLZ opcode
  // -------------------------------------------------------------------------
  [EIP.EIP_7939]: {
    clzGas: 5,
  },

  // -------------------------------------------------------------------------
  // EOF EIPs
  // -------------------------------------------------------------------------
  [EIP.EIP_663]: {
    dupnGas: 3,
    swapnGas: 3,
    exchangeGas: 3,
  },

  [EIP.EIP_4200]: {
    rjumpGas: 2,
    rjumpiGas: 4,
    rjumpvGas: 4,
  },

  [EIP.EIP_4750]: {
    callfGas: 5,
    retfGas: 3,
  },

  [EIP.EIP_6206]: {
    jumpfGas: 5,
  },

  [EIP.EIP_7069]: {
    extcallGas: 0,
    extdelegatecallGas: 0,
    extstaticcallGas: 0,
    returndataloadGas: 3,
    minRetainedGas: 5000,
    minCalleeGas: 2300,
  },

  [EIP.EIP_7480]: {
    dataloadGas: 4,
    dataloadnGas: 3,
    datasizeGas: 2,
    datacopyGas: 3,
  },

  [EIP.EIP_7620]: {
    eofcreateGas: 32000,
    returncontractGas: 0,
  },
} as const satisfies Partial<Record<EIP, Partial<ChainParams>>>

export const HardforkParams: Partial<Record<Hardfork, Partial<ChainParams>>> = {
  [Hardfork.Bpo1]: {
    target: 10,
    max: 15,
    blobGasPriceUpdateFraction: 8346193,
  },
  [Hardfork.Bpo2]: {
    target: 14,
    max: 21,
    blobGasPriceUpdateFraction: 11684671,
  },
}
