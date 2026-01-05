import { deepFreeze } from '@ts-ethereum/utils'
import type { HeaderData } from '../../types'
import { validateBlockHeader } from '../../validation'
import { computeHash, ethashCanonicalDifficulty } from '../helpers'
import type {
  CreateHeaderOptions,
  FrozenBlockHeader,
  ValidatedHeaderData,
} from '../types'

export function fromHeaderData(
  headerData: HeaderData,
  opts: CreateHeaderOptions,
): FrozenBlockHeader {
  const validatedHeader = validateBlockHeader({
    header: headerData,
    hardforkManager: opts.hardforkManager,
    validateConsensus: !opts.skipConsensusFormatValidation,
  })

  const initialHeader = {
    data: validatedHeader as ValidatedHeaderData,
    hardforkManager: opts.hardforkManager,
    _cache: { hash: undefined },
  }

  const difficulty = ethashCanonicalDifficulty(
    initialHeader,
    opts.calcDifficultyFromHeader,
  )

  const headerWithDifficulty = {
    data: {
      ...initialHeader.data,
      difficulty,
    },
    hardforkManager: opts.hardforkManager,
    _cache: { hash: undefined },
  }

  const shouldFreeze = opts.freeze !== false
  const hash = shouldFreeze ? computeHash(headerWithDifficulty) : undefined

  const finalHeader = {
    data: headerWithDifficulty.data,
    hardforkManager: opts.hardforkManager,
    _cache: { hash },
  }

  return shouldFreeze ? deepFreeze(finalHeader) : finalHeader
}
