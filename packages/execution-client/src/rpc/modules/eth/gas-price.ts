import {
  Capability,
  type FeeMarket1559Tx,
  type LegacyTx,
} from '@ts-ethereum/tx'
import { BIGINT_0, bigIntToHex, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { gasPriceSchema } from './schema'

export const gasPrice = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(gasPriceSchema, async (_params, _c) => {
    const minGasPrice = BIGINT_0
    let gasPrice = BIGINT_0
    const latest = await chain.getCanonicalHeadHeader()

    const blockIterations = 20n < latest.number ? 20n : latest.number
    let txCount = BIGINT_0
    for (let i = 0n; i < blockIterations; i++) {
      const block = await chain.getBlock(latest.number - i)
      if (block.transactions.length === 0) {
        continue
      }

      for (const tx of block.transactions) {
        // Handle both legacy and EIP-1559 transactions
        let txGasPrice: bigint
        if (tx.supports(Capability.EIP1559FeeMarket)) {
          // For EIP-1559 txs, use maxFeePerGas as proxy for gas price
          txGasPrice = (tx as FeeMarket1559Tx).maxFeePerGas
        } else {
          txGasPrice = (tx as LegacyTx).gasPrice
        }
        gasPrice += txGasPrice
        txCount++
      }
    }

    if (txCount > 0n) {
      const avgGasPrice = gasPrice / txCount
      gasPrice = avgGasPrice > minGasPrice ? avgGasPrice : minGasPrice
    } else {
      gasPrice = minGasPrice
    }

    return safeResult(bigIntToHex(gasPrice))
  })
}
