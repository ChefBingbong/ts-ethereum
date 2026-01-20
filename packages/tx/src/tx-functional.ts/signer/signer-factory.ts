import type { HardforkManager } from '@ts-ethereum/chain-config'
import { CancunSigner } from './cancun'
import { EIP155Signer } from './eip155'
import { EIP2930Signer } from './eip2930'
import { FrontierSigner } from './frontier'
import { HomesteadSigner } from './homestead'
import { LondonSigner } from './london'
import { PragueSigner } from './prague'
import type { Signer } from './types'

/**
 * MakeSigner returns a Signer based on the given chain config and block number.
 * Equivalent to Go's MakeSigner function.
 */
export function makeSigner(
  common: HardforkManager,
  blockNumber?: bigint,
  blockTime?: bigint,
): Signer {
  const chainId = common.chainId()

  // Check hardforks in order (most recent first)
  if (common.isPragueActive(blockNumber, blockTime)) {
    return new PragueSigner(chainId)
  }
  if (common.isCancunActive(blockNumber, blockTime)) {
    return new CancunSigner(chainId)
  }
  if (common.isLondonActive(blockNumber)) {
    return new LondonSigner(chainId)
  }
  if (common.isBerlinActive(blockNumber)) {
    return new EIP2930Signer(chainId)
  }
  if (common.isEIP155Active(blockNumber)) {
    return new EIP155Signer(chainId)
  }
  if (common.isHomesteadActive(blockNumber)) {
    return new HomesteadSigner()
  }
  return new FrontierSigner()
}

/**
 * LatestSigner returns the 'most permissive' Signer available.
 * Equivalent to Go's LatestSigner function.
 */
export function latestSigner(common: HardforkManager): Signer {
  const chainId = common.chainId()

  // Check if hardforks are scheduled (regardless of block number)
  if (common.hasPrague()) {
    return new PragueSigner(chainId)
  }
  if (common.hasCancun()) {
    return new CancunSigner(chainId)
  }
  if (common.hasLondon()) {
    return new LondonSigner(chainId)
  }
  if (common.hasBerlin()) {
    return new EIP2930Signer(chainId)
  }
  if (common.hasEIP155()) {
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
