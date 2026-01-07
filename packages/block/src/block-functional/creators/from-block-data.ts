import { createTx, type TypedTransaction } from '@ts-ethereum/tx'
import { createWithdrawal, type Withdrawal } from '@ts-ethereum/utils'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { fromHeaderData } from '../../header-functional/creators'
import type { BlockData } from '../../types'
import { validateBlockConstructor } from '../../validation/block'
import type { CreateBlockOptions, FrozenBlock } from '../types'

export function fromBlockData(
  blockData: BlockData,
  opts: CreateBlockOptions,
): FrozenBlock {
  const {
    header: headerData,
    transactions: txsData,
    uncleHeaders: uhsData,
    withdrawals: withdrawalsData,
  } = blockData

  const frozenHeader = fromHeaderData(headerData ?? {}, {
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

  // Parse transactions
  const transactions: TypedTransaction[] = []
  for (const txData of txsData ?? []) {
    // TODO: Migrate tx package to use hardforkManager
    const tx = createTx(txData, {
      ...opts,
      common: opts.hardforkManager,
    })
    transactions.push(tx)
  }

  // Parse uncle headers
  const uncleHeaders: (typeof frozenHeader)[] = []
  const uncleHeaderManagers = []
  for (const uhData of uhsData ?? []) {
    const frozenUncleHeader = fromHeaderData(uhData, {
      hardforkManager: opts.hardforkManager,
      calcDifficultyFromHeader: undefined,
      freeze: opts.freeze !== false,
      skipConsensusFormatValidation: opts.skipConsensusFormatValidation,
    })
    uncleHeaders.push(frozenUncleHeader)
    uncleHeaderManagers.push(
      createBlockHeaderManagerFromHeader(frozenUncleHeader),
    )
  }

  // Validate block data using Zod schema
  const validated = validateBlockConstructor(
    {
      uncleHeaders: uncleHeaderManagers,
      withdrawals: withdrawalsData?.map(createWithdrawal),
      isGenesis: frozenHeader.data.number === 0n,
    },
    {
      hardforkManager: opts.hardforkManager,
      number: frozenHeader.data.number,
    },
    frozenHeader.data.number,
  )

  const withdrawals = validated.withdrawals

  const block: FrozenBlock = {
    header: frozenHeader,
    transactions: Object.freeze(transactions) as readonly TypedTransaction[],
    uncleHeaders: Object.freeze(
      uncleHeaders,
    ) as readonly (typeof frozenHeader)[],
    withdrawals:
      withdrawals !== undefined
        ? (Object.freeze(withdrawals) as readonly Withdrawal[])
        : undefined,
    hardforkManager: opts.hardforkManager,
    _cache: {
      txTrieRoot: undefined,
      withdrawalsTrieRoot: undefined,
      hash: undefined,
    },
  }

  return block
}
