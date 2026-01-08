import type { Block } from '@ts-ethereum/block'
import { bytesToHex } from '@ts-ethereum/utils'

import type { ExecutionPayloadBodyV1 } from '../types'

export const getPayloadBody = (block: Block): ExecutionPayloadBodyV1 => {
  const transactions = block.transactions.map((tx) =>
    bytesToHex(tx.serialize()),
  )
  const withdrawals = block.withdrawals?.map((wt) => wt.toJSON()) ?? null

  return {
    transactions,
    withdrawals,
  }
}
