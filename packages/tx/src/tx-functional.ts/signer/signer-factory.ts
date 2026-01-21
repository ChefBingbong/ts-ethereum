import { Hardfork, type HardforkManager } from '@ts-ethereum/chain-config'
import type { HardforkContext } from '@ts-ethereum/chain-config/src/config/functional'
import type { Signer } from '../types'
import { CancunSigner } from './cancun'
import { EIP155Signer } from './eip155'
import { EIP2930Signer } from './eip2930'
import { FrontierSigner } from './frontier'
import { HomesteadSigner } from './homestead'
import { LondonSigner } from './london'
import { PragueSigner } from './prague'

/**
 * MakeSigner returns a Signer based on the given chain config and hardfork.
 * Equivalent to Go's MakeSigner function.
 *
 * Uses the latest hardfork from HardforkManager if no specific context is given.
 */
export function makeSigner(
  common: HardforkManager,
  blockNumber?: bigint,
  blockTime?: bigint,
  hardforkContext?: HardforkContext,
): Signer {
  const chainId = common.chainId()

  // Get the active hardfork for the given block context, or use latest
  let hardfork = common.getLatestHardfork()
  if (hardforkContext) {
    hardfork = common.getHardforkFromContext(hardforkContext)
  }
  if (blockNumber !== undefined || blockTime !== undefined) {
    hardfork = common.getHardforkByBlock(blockNumber, blockTime)
  }
  // Check hardforks in order (most recent first)
  if (common.hardforkGte(hardfork, Hardfork.Prague)) {
    return new PragueSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.Cancun)) {
    return new CancunSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.London)) {
    return new LondonSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.Berlin)) {
    return new EIP2930Signer(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.SpuriousDragon)) {
    return new EIP155Signer(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.Homestead)) {
    return new HomesteadSigner()
  }
  return new FrontierSigner()
}

/**
 * LatestSigner returns the 'most permissive' Signer available.
 * Equivalent to Go's LatestSigner function.
 *
 * Uses the latest configured hardfork regardless of current block.
 */
export function latestSigner(common: HardforkManager): Signer {
  const chainId = common.chainId()
  const hardfork = common.getLatestHardfork()

  // Check hardforks in order (most recent first)
  if (common.hardforkGte(hardfork, Hardfork.Prague)) {
    return new PragueSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.Cancun)) {
    return new CancunSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.London)) {
    return new LondonSigner(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.Berlin)) {
    return new EIP2930Signer(chainId)
  }
  if (common.hardforkGte(hardfork, Hardfork.SpuriousDragon)) {
    return new EIP155Signer(chainId)
  }
  return new HomesteadSigner()
}

/**
 * LatestSignerForChainID returns the most permissive Signer for a chain ID.
 */
export function latestSignerForChainID(chainId: bigint): Signer {
  // Default to Prague signer (most permissive) if chain ID is provided
  return new PragueSigner(chainId)
}
