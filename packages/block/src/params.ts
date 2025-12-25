import type { ParamsDict } from '@ts-ethereum/chain-config'

/**
 * Block parameters for Frontier/Chainstart only.
 * This is a value-transfer-only blockchain - no EIP-specific params needed.
 */
export const paramsBlock: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  1: {
    // gasConfig
    minGasLimit: 3000, // Minimum the gas limit may ever be
    gasLimitBoundDivisor: 1024, // The bound divisor of the gas limit, used in update calculations
    // format
    maxExtraDataSize: 32, // Maximum size extra data may be after Genesis
    // pow
    minimumDifficulty: 250, // The minimum that the difficulty may ever be
    difficultyBoundDivisor: 2048, // The bound divisor of the difficulty, used in the update calculations
    durationLimit: 13, // The decision boundary on the blocktime duration used to determine whether difficulty should go up or not
  },
}
