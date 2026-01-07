import {
  createTx,
  normalizeTxParams,
  type TypedTransaction,
} from '@ts-ethereum/tx'
import { createWithdrawal, type Withdrawal } from '@ts-ethereum/utils'
import { createBlockHeaderManagerFromRPC } from '../../header-functional'
import type { JSONRPCBlock } from '../../types'
import { validateBlockConstructor } from '../../validation/block'
import type { CreateBlockOptions, FrozenBlock } from '../types'

export function fromRPC(
  blockParams: JSONRPCBlock,
  uncles: any[],
  opts: CreateBlockOptions,
): FrozenBlock {
  const headerManager = createBlockHeaderManagerFromRPC(blockParams, {
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

  const frozenHeader = headerManager.header

  // Parse transactions
  const transactions: TypedTransaction[] = []
  // TODO: Migrate tx package to use hardforkManager
  for (const _txParams of blockParams.transactions ?? []) {
    const txParams = normalizeTxParams(_txParams)
    const tx = createTx(txParams, {
      ...opts,
      common: opts.hardforkManager,
    })
    transactions.push(tx)
  }

  // Parse uncle headers
  const uncleHeaders: (typeof frozenHeader)[] = []
  const uncleHeaderManagers = []
  for (const uh of uncles) {
    const uncleHeaderManager = createBlockHeaderManagerFromRPC(uh, {
      hardforkManager: opts.hardforkManager,
      calcDifficultyFromHeader: undefined,
      skipConsensusFormatValidation: opts.skipConsensusFormatValidation,
      freeze: opts.freeze !== false,
    })
    uncleHeaders.push(uncleHeaderManager.header)
    uncleHeaderManagers.push(uncleHeaderManager)
  }

  const withdrawals = blockParams.withdrawals?.map(createWithdrawal)

  // Validate block data
  const validated = validateBlockConstructor(
    {
      uncleHeaders: uncleHeaderManagers,
      withdrawals,
      isGenesis: frozenHeader.data.number === 0n,
    },
    {
      hardforkManager: opts.hardforkManager,
      number: frozenHeader.data.number,
    },
    frozenHeader.data.number,
  )

  const finalWithdrawals = validated.withdrawals

  const block: FrozenBlock = {
    header: frozenHeader,
    transactions: Object.freeze(transactions) as readonly TypedTransaction[],
    uncleHeaders: Object.freeze(
      uncleHeaders,
    ) as readonly (typeof frozenHeader)[],
    withdrawals:
      finalWithdrawals !== undefined
        ? (Object.freeze(finalWithdrawals) as readonly Withdrawal[])
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
