import { fromHeaderData } from '../../header-functional/creators'
import type { HeaderData } from '../../types'
import type { CreateBlockOptions, FrozenBlock } from '../types'

export function createEmpty(
  headerData: HeaderData,
  opts: CreateBlockOptions,
): FrozenBlock {
  const frozenHeader = fromHeaderData(headerData, {
    hardforkManager: opts.hardforkManager,
    calcDifficultyFromHeader: opts.calcDifficultyFromHeader
      ? {
          timestamp: opts.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: opts.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: opts.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: opts.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
    skipConsensusFormatValidation: opts.skipConsensusFormatValidation,
    freeze: opts.freeze !== false,
  })

  const block: FrozenBlock = {
    header: frozenHeader,
    transactions: Object.freeze([]) as readonly [],
    uncleHeaders: Object.freeze([]) as readonly [],
    withdrawals: undefined,
    hardforkManager: opts.hardforkManager,
    _cache: {
      txTrieRoot: undefined,
      withdrawalsTrieRoot: undefined,
      hash: undefined,
    },
  }

  return block
}
