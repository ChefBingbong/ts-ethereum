import {
  createTxManagerFromBlockBodyData,
  type TxManager,
} from '@ts-ethereum/tx'
import {
  createWithdrawal,
  EthereumJSErrorWithoutCode,
  type Withdrawal,
} from '@ts-ethereum/utils'
import { createBlockHeaderManagerFromBytes } from '../../header-functional'
import type { BlockBytes } from '../../types'
import { validateBlockConstructor } from '../../validation/block'
import type { CreateBlockOptions, FrozenBlock } from '../types'

export function fromBytesArray(
  values: BlockBytes,
  opts: CreateBlockOptions,
): FrozenBlock {
  if (values.length > 5) {
    throw EthereumJSErrorWithoutCode(
      `invalid: More values=${values.length} than expected were received (at most 5)`,
    )
  }

  const [headerData, txsData, uhsData, ...valuesTail] = values

  const headerManager = createBlockHeaderManagerFromBytes(headerData, {
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

  const withdrawalBytes = frozenHeader.hardforkManager.isEIPActiveAtBlock(
    4895,
    {
      blockNumber: frozenHeader.data.number,
      timestamp: frozenHeader.data.timestamp,
    },
  )
    ? valuesTail.splice(0, 1)[0]
    : undefined

  if (
    frozenHeader.hardforkManager.isEIPActiveAtBlock(4895, {
      blockNumber: frozenHeader.data.number,
      timestamp: frozenHeader.data.timestamp,
    }) &&
    (withdrawalBytes === undefined || !Array.isArray(withdrawalBytes))
  ) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized block input: EIP-4895 is active, and no withdrawals were provided as array',
    )
  }

  // Parse transactions
  const transactions: TxManager[] = []
  for (const txData of txsData ?? []) {
    transactions.push(
      createTxManagerFromBlockBodyData(txData, {
        ...opts,
        common: opts.hardforkManager,
      }),
    )
  }

  // Parse uncle headers
  const uncleHeaders: (typeof frozenHeader)[] = []
  const uncleHeaderManagers = []
  const uncleOpts = {
    hardforkManager: frozenHeader.hardforkManager,
    calcDifficultyFromHeader: undefined,
    skipConsensusFormatValidation: opts.skipConsensusFormatValidation,
    freeze: opts.freeze !== false,
  }
  for (const uncleHeaderData of uhsData ?? []) {
    const uncleHeaderManager = createBlockHeaderManagerFromBytes(
      uncleHeaderData,
      uncleOpts,
    )
    uncleHeaders.push(uncleHeaderManager.header)
    uncleHeaderManagers.push(uncleHeaderManager)
  }

  // Parse withdrawals
  const withdrawals = withdrawalBytes
    ?.map(([index, validatorIndex, address, amount]) => ({
      index,
      validatorIndex,
      address,
      amount,
    }))
    ?.map(createWithdrawal)

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
    transactions: Object.freeze(transactions) as readonly TxManager[],
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
