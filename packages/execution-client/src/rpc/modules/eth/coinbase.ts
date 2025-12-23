import { safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { coinbaseSchema } from './schema'

export const coinbase = (node: ExecutionNode) =>
  createRpcMethod(coinbaseSchema, async (_params, _c) => {
    const cb = node.config.options.minerCoinbase
    if (cb === undefined) {
      return safeError(new Error('Coinbase must be explicitly specified'))
    }
    return safeResult(cb.toString())
  })
