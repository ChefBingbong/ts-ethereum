import type { JSONRPCTx } from '../../types'
import { normalizeTxParams } from '../../util/general'
import type { CreateTxOptions, FrozenTransaction } from '../types'
import { fromTxData } from './from-tx-data'

/**
 * Creates a FrozenTransaction from JSON-RPC transaction data.
 */
export function fromRPC(
  txData: JSONRPCTx,
  opts: CreateTxOptions,
): FrozenTransaction {
  const normalized = normalizeTxParams(txData)
  return fromTxData(normalized, opts)
}
