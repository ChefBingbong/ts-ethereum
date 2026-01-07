import type { BlockHeaderManager } from '../../header-functional'
import type { CreateBlockOptions, FrozenBlock } from '../types'

/**
 * Creates a FrozenBlock from an existing BlockHeaderManager without recreating the header.
 * This preserves the exact header state including hash cache.
 */
export function fromHeader(
  header: BlockHeaderManager,
  opts: CreateBlockOptions,
): FrozenBlock {
  // Use the existing FrozenBlockHeader directly without recreating it
  const frozenHeader = header.header

  const block: FrozenBlock = {
    header: frozenHeader,
    transactions: Object.freeze([]) as readonly [],
    uncleHeaders: Object.freeze([]) as readonly [],
    withdrawals: undefined,
    hardforkManager: opts.hardforkManager ?? header.hardforkManager,
    _cache: {
      txTrieRoot: undefined,
      withdrawalsTrieRoot: undefined,
      hash: undefined,
    },
  }

  return block
}
