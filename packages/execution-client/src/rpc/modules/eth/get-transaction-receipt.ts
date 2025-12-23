import type { LegacyTx } from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import { equalsBytes, hexToBytes } from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import { runBlock } from '@ts-ethereum/vm'
import type { ReceiptsManager } from '../../../execution/receipt'
import type { TxIndex } from '../../../execution/txIndex'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { toJSONRPCReceipt } from './helpers'
import { getTransactionReceiptSchema } from './schema'

export const getTransactionReceipt = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  const receiptsManager: ReceiptsManager | undefined =
    node.execution.execution.receiptsManager
  const txIndex: TxIndex | undefined = node.execution.execution.txIndex
  return createRpcMethod(
    getTransactionReceiptSchema,
    async (params: [PrefixedHexString], _c) => {
      try {
        const [txHash] = params

        if (!receiptsManager)
          return safeError(new Error('missing receiptsManager'))
        if (!txIndex) return safeError(new Error('missing txIndex'))
        if (!vm) return safeError(new Error('missing vm'))

        const txHashIndex = await txIndex.getIndex(hexToBytes(txHash))
        if (!txHashIndex) return safeResult(null)

        const result =
          await receiptsManager.getReceiptByTxHashIndex(txHashIndex)
        if (!result) return safeResult(null)

        const [receipt, blockHash, txIdx, logIndex] = result
        const block = await chain.getBlock(blockHash)
        const blockByNumber = await chain.getBlock(block.header.number)
        if (!equalsBytes(blockByNumber.hash(), block.hash())) {
          return safeResult(null)
        }

        const parentBlock = await chain.getBlock(block.header.parentHash)
        const tx = block.transactions[txIdx]
        const effectiveGasPrice = (tx as LegacyTx).gasPrice

        const vmCopy = await vm.shallowCopy()
        const runBlockResult = await runBlock(vmCopy, {
          block,
          root: parentBlock.header.stateRoot,
          skipBlockValidation: true,
        })

        const { totalGasSpent } = runBlockResult.results[txIdx]
        const jsonRpcReceipt = await toJSONRPCReceipt(
          receipt,
          totalGasSpent,
          effectiveGasPrice,
          block,
          tx,
          txIdx,
          logIndex,
          undefined,
        )
        return safeResult(jsonRpcReceipt)
      } catch (error) {
        return safeError(error as Error)
      }
    },
  )
}
