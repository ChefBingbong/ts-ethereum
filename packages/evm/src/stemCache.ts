import type { PrefixedHexString } from '@ts-ethereum/utils'
import type {
	BinaryStemAccessEvent,
	BinaryStemMeta,
} from './binaryTreeAccessWitness'

/**
 * Simple cache for binary tree stem access events.
 * Used by BinaryTreeAccessWitness for Verkle tree stateless Ethereum.
 */
export class StemCache {
  private cache: Map<
    PrefixedHexString,
    BinaryStemAccessEvent & BinaryStemMeta
  > = new Map()

  get(
    key: PrefixedHexString,
  ): (BinaryStemAccessEvent & BinaryStemMeta) | undefined {
    return this.cache.get(key)
  }

  set(
    key: PrefixedHexString,
    value: BinaryStemAccessEvent & BinaryStemMeta,
  ): void {
    this.cache.set(key, value)
  }

  commit(): Map<PrefixedHexString, BinaryStemAccessEvent & BinaryStemMeta> {
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
