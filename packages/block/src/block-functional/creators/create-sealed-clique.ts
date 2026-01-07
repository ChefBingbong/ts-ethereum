import { generateCliqueBlockExtraData } from '../../consensus/clique'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { fromHeaderData } from '../../header-functional/creators'
import type { BlockData } from '../../types'
import type { CreateBlockOptions, FrozenBlock } from '../types'
import { fromBlockData } from './from-block-data'

export function createSealedClique(
  cliqueSigner: Uint8Array,
  blockData: BlockData,
  opts: CreateBlockOptions,
): FrozenBlock {
  const sealedCliqueBlock = fromBlockData(blockData, {
    ...opts,
    freeze: false,
    skipConsensusFormatValidation: true,
  })

  // Create header manager to use with generateCliqueBlockExtraData
  const headerManager = createBlockHeaderManagerFromHeader(
    sealedCliqueBlock.header,
  )

  const newExtraData = generateCliqueBlockExtraData(headerManager, cliqueSigner)

  // Create a new header with updated extraData
  const updatedHeaderData = {
    ...sealedCliqueBlock.header.data,
    extraData: newExtraData,
  }

  const frozenHeader = fromHeaderData(updatedHeaderData, {
    hardforkManager: opts.hardforkManager,
    calcDifficultyFromHeader: opts.calcDifficultyFromHeader
      ? {
          timestamp: opts.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: opts.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: opts.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: opts.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
    freeze: opts?.freeze !== false,
    skipConsensusFormatValidation: opts?.skipConsensusFormatValidation,
  })

  const finalBlock: FrozenBlock = {
    header: frozenHeader,
    transactions: sealedCliqueBlock.transactions,
    uncleHeaders: sealedCliqueBlock.uncleHeaders,
    withdrawals: sealedCliqueBlock.withdrawals,
    hardforkManager: opts.hardforkManager,
    _cache: {
      txTrieRoot: undefined,
      withdrawalsTrieRoot: undefined,
      hash: undefined,
    },
  }

  return finalBlock
}
