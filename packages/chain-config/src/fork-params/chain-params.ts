import { MAX_RLP_BLOCK_SIZE } from '@ts-ethereum/utils'
import type { ParamsDict } from '../types'
import { EIP } from './enums'

/**
 * Block parameters for Frontier/Chainstart only.
 * This is a value-transfer-only blockchain - no EIP-specific params needed.
 */
export const paramsBlock: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  [EIP.EIP_1]: {
    // gasConfig
    minGasLimit: 3000n, // Minimum the gas limit may ever be
    gasLimitBoundDivisor: 1024n, // The bound divisor of the gas limit, used in update calculations
    targetBlobGasPerBlock: 0n, // Base value needed here since called pre-4844 in BlockHeader.calcNextExcessBlobGas()
    blobGasPerBlob: 0n,
    maxBlobGasPerBlock: 0n,
    // format
    maxExtraDataSize: 32n, // Maximum size extra data may be after Genesis
    // pow
    minimumDifficulty: 1n, // The minimum that the difficulty may ever be
    difficultyBoundDivisor: 2048n, // The bound divisor of the difficulty, used in the update calculations
    durationLimit: 1n, // The decision boundary on the blocktime duration used to determine whether difficulty should go up or not
    difficultyBombDelay: 0n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Byzantium HF Meta EIP
   */
  [EIP.EIP_609]: {
    // pow
    difficultyBombDelay: 3000000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Constantinople HF Meta EIP
   */
  [EIP.EIP_606]: {
    // pow
    difficultyBombDelay: 5000000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * MuirGlacier HF Meta EIP
   */
  [EIP.EIP_2384]: {
    // pow
    difficultyBombDelay: 9000000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Fee market change for ETH 1.0 chain
   */
  1559: {
    // gasConfig
    baseFeeMaxChangeDenominator: 8n, // Maximum base fee change denominator
    elasticityMultiplier: 2n, // Maximum block gas target elasticity
    initialBaseFee: 1000000000n, // Initial base fee on first EIP1559 block
  },
  /**
   * Difficulty Bomb Delay to December 1st 2021
   */
  [EIP.EIP_3554]: {
    // pow
    difficultyBombDelay: 9500000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Difficulty Bomb Delay to June 2022
   */
  [EIP.EIP_4345]: {
    // pow
    difficultyBombDelay: 10700000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Shard Blob Transactions
   */
  [EIP.EIP_4844]: {
    // gasConfig
    targetBlobGasPerBlock: 393216n, // The target blob gas consumed per block
    blobGasPerBlob: 131072n, // The base fee for blob gas per blob
    maxBlobGasPerBlock: 786432n, // The max blob gas allowable per block
    blobGasPriceUpdateFraction: 3338477n, // The denominator used in the exponential when calculating a blob gas price
    // gasPrices
    minBlobGas: 1n, // The minimum fee per blob gas
    blobBaseCost: 8192n, // EIP-7918: Blob base fee bounded by execution cost (2^13)
  },
  /**
   * Delaying Difficulty Bomb to mid-September 2022
   */
  [EIP.EIP_5133]: {
    // pow
    difficultyBombDelay: 11400000n, // the amount of blocks to delay the difficulty bomb with
  },
  /**
   * Blob throughput increase
   */
  [EIP.EIP_7691]: {
    // gasConfig
    targetBlobGasPerBlock: 786432n, // The target blob gas consumed per block
    maxBlobGasPerBlock: 1179648n, // The max blob gas allowable per block
    blobGasPriceUpdateFraction: 5007716n, // The denominator used in the exponential when calculating a blob gas price
  },
  [EIP.EIP_7934]: {
    // config
    maxRlpBlockSize: BigInt(MAX_RLP_BLOCK_SIZE), // The maximum size of the RLP block in bytes
  },
}
