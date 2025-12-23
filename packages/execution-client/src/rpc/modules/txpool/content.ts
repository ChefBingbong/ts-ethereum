import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { toJSONRPCTx } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { contentSchema } from './schema'

export const content = (node: ExecutionNode) => {
  const txpool = node.txPool
  return createRpcMethod(contentSchema, async (_params, _c) => {
    const pending = new Map()
    // Iterate over both pending and queued pools
    for (const [addr, txs] of txpool.pending.entries()) {
      const pendingForAcct = new Map<bigint, any>()
      for (const tx of txs) {
        pendingForAcct.set(tx.tx.nonce, toJSONRPCTx(tx.tx))
      }
      if (pendingForAcct.size > 0) {
        pending.set('0x' + addr, Object.fromEntries(pendingForAcct))
      }
    }

    const queued = new Map()
    for (const [addr, txs] of txpool.queued.entries()) {
      const queuedForAcct = new Map<bigint, any>()
      for (const tx of txs) {
        queuedForAcct.set(tx.tx.nonce, toJSONRPCTx(tx.tx))
      }
      if (queuedForAcct.size > 0) {
        queued.set('0x' + addr, Object.fromEntries(queuedForAcct))
      }
    }

    return safeResult({
      pending: Object.fromEntries(pending),
      queued: Object.fromEntries(queued),
    })
  })
}
