import { createTxManager, type TxManager } from '@ts-ethereum/tx'
import { createWithdrawal, type Withdrawal } from '@ts-ethereum/utils'
import { createBlockHeaderManagerFromHeader } from '../../header-functional'
import { fromHeaderData } from '../../header-functional/creators'
import type { BlockData } from '../../types'
import { validateBlockConstructor } from '../../validation/block'
import type { CreateBlockOptions, FrozenBlock } from '../types'

/**
 * Check if a value is already a TxManager instance (has 'tx' property)
 */
function isTxManager(value: unknown): value is TxManager {
  return (
    value !== null &&
    typeof value === 'object' &&
    'tx' in value &&
    typeof (value as TxManager).hash === 'function'
  )
}

/**
 * Check if a value is an already-constructed transaction object
 * (either TxManager or old TypedTransaction class)
 */
function isTransactionObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as any).hash === 'function' &&
    typeof (value as any).serialize === 'function'
  )
}

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
  const transactions: TxManager[] = []
  for (const txData of txsData ?? []) {
    // Check if txData is already a TxManager
    if (isTxManager(txData)) {
      transactions.push(txData)
    }
    // Check if txData is an already-constructed transaction object (old TypedTransaction)
    // that needs to be wrapped. Cast to TxManager since both have compatible interfaces.
    else if (isTransactionObject(txData)) {
      // TypedTransaction and TxManager share the same runtime interface,
      // so we can safely cast it for use in the block
      transactions.push(txData as unknown as TxManager)
    }
    // Otherwise, it's raw transaction data
    else {
      const tx = createTxManager(txData, {
        ...opts,
        common: opts.hardforkManager,
      })
      transactions.push(tx)
    }
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
      timestamp: frozenHeader.data.timestamp,
    },
    frozenHeader.data.number,
  )

  const withdrawals = validated.withdrawals

  const block: FrozenBlock = {
    header: frozenHeader,
    transactions: Object.freeze(transactions) as readonly TxManager[],
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
