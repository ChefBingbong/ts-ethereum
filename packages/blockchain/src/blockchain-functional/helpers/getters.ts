/**
 * Pure getter functions for blockchain configuration and state.
 * All functions take required data as arguments and return computed values.
 */

import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { Consensus, ConsensusDict, FrozenBlockchainConfig } from '../types'

/**
 * Gets the consensus implementation for the current chain configuration.
 *
 * @param consensusDict - Dictionary of consensus implementations
 * @param hardforkManager - HardforkManager instance
 * @returns Consensus implementation or undefined if not found
 */
export function getConsensus(
  consensusDict: ConsensusDict,
  hardforkManager: HardforkManager,
): Consensus | undefined {
  const consensusAlgo = hardforkManager.config.spec.chain.consensus.algorithm
  return consensusDict[consensusAlgo]
}

/**
 * Gets the consensus algorithm name from the config.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns Consensus algorithm name
 */
export function getConsensusAlgorithm(
  hardforkManager: HardforkManager,
): string {
  return hardforkManager.config.spec.chain.consensus.algorithm
}

/**
 * Gets the consensus type (PoW, PoA, PoS) from the config.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns Consensus type
 */
export function getConsensusType(hardforkManager: HardforkManager): string {
  return hardforkManager.config.spec.chain.consensus.type ?? 'pow'
}

/**
 * Checks if consensus validation is available and required.
 *
 * @param config - Frozen blockchain config
 * @param consensusDict - Dictionary of consensus implementations
 * @returns True if consensus validation should be performed
 */
export function shouldValidateConsensus(
  config: FrozenBlockchainConfig,
  consensusDict: ConsensusDict,
): boolean {
  if (!config.validateConsensus) {
    return false
  }

  const consensus = getConsensus(consensusDict, config.hardforkManager)
  return consensus !== undefined
}

/**
 * Gets the chain ID from the hardfork manager.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns Chain ID as bigint
 */
export function getChainId(hardforkManager: HardforkManager): bigint {
  return hardforkManager.chainId()
}

/**
 * Gets the current hardfork for a given block context.
 *
 * @param hardforkManager - HardforkManager instance
 * @param blockNumber - Block number
 * @param timestamp - Optional block timestamp
 * @returns Hardfork name
 */
export function getHardforkForBlock(
  hardforkManager: HardforkManager,
  blockNumber: bigint,
  timestamp?: bigint,
): string {
  return hardforkManager.getHardforkByBlock(blockNumber, timestamp)
}

/**
 * Checks if an EIP is active at a given block.
 *
 * @param hardforkManager - HardforkManager instance
 * @param eip - EIP number
 * @param blockNumber - Block number
 * @param timestamp - Optional block timestamp
 * @returns True if EIP is active
 */
export function isEIPActiveAtBlock(
  hardforkManager: HardforkManager,
  eip: number,
  blockNumber: bigint,
  timestamp?: bigint,
): boolean {
  const hardfork = hardforkManager.getHardforkByBlock(blockNumber, timestamp)
  return hardforkManager.isEIPActiveAtHardfork(eip, hardfork)
}

/**
 * Resolves the initial hardfork from options.
 *
 * @param hardforkManager - HardforkManager instance
 * @param hardfork - Optional hardfork identifier or block context
 * @returns Resolved hardfork name
 */
export function resolveHardfork(
  hardforkManager: HardforkManager,
  hardfork?: string | { blockNumber: bigint; timestamp?: bigint },
): string {
  return hardforkManager.getHardforkFromContext(hardfork)
}

/**
 * Gets the block number at which a hardfork activates.
 *
 * @param hardforkManager - HardforkManager instance
 * @param hardfork - Hardfork name
 * @returns Block number or null if not block-based
 */
export function getHardforkBlock(
  hardforkManager: HardforkManager,
  hardfork: string,
): bigint | null {
  return hardforkManager.hardforkBlock(hardfork)
}

/**
 * Gets a parameter value at a specific hardfork.
 *
 * @param hardforkManager - HardforkManager instance
 * @param param - Parameter name
 * @param hardfork - Hardfork name
 * @returns Parameter value or undefined
 */
export function getParamAtHardfork<T>(
  hardforkManager: HardforkManager,
  param: Parameters<HardforkManager['getParamAtHardfork']>[0],
  hardfork: string,
): T | undefined {
  return hardforkManager.getParamAtHardfork(param, hardfork) as T | undefined
}

/**
 * Compares two hardforks to determine ordering.
 *
 * @param hardforkManager - HardforkManager instance
 * @param hardfork - Hardfork to check
 * @param refHardfork - Reference hardfork to compare against
 * @returns True if hardfork >= refHardfork
 */
export function isHardforkGte(
  hardforkManager: HardforkManager,
  hardfork: string,
  refHardfork: string,
): boolean {
  return hardforkManager.hardforkGte(hardfork, refHardfork)
}

/**
 * Checks if the chain uses Proof of Stake consensus.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns True if PoS
 */
export function isProofOfStake(hardforkManager: HardforkManager): boolean {
  return hardforkManager.config.spec.chain.consensus.algorithm === 'pos'
}

/**
 * Checks if the chain uses Proof of Authority consensus.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns True if PoA (clique)
 */
export function isProofOfAuthority(hardforkManager: HardforkManager): boolean {
  return hardforkManager.config.spec.chain.consensus.type === 'poa'
}

/**
 * Checks if the chain uses Proof of Work consensus.
 *
 * @param hardforkManager - HardforkManager instance
 * @returns True if PoW (ethash)
 */
export function isProofOfWork(hardforkManager: HardforkManager): boolean {
  const consensusType = hardforkManager.config.spec.chain.consensus.type
  return consensusType === 'pow' || consensusType === undefined
}
