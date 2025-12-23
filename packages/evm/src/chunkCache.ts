import type { PrefixedHexString } from '@ts-ethereum/utils'
import type { BinaryChunkAccessEvent } from './binaryTreeAccessWitness'

/**
 * Simple cache for binary tree chunk access events.
 * Used by BinaryTreeAccessWitness for Verkle tree stateless Ethereum.
 */
export class ChunkCache {
  private cache: Map<PrefixedHexString, BinaryChunkAccessEvent> = new Map()

  get(key: PrefixedHexString): BinaryChunkAccessEvent | undefined {
    return this.cache.get(key)
  }

  set(key: PrefixedHexString, value: BinaryChunkAccessEvent): void {
    this.cache.set(key, value)
  }

  commit(): Map<PrefixedHexString, BinaryChunkAccessEvent> {
    const committed = new Map(this.cache)
    this.cache.clear()
    return committed
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}
