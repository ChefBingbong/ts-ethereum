import {
  Capability,
  type FeeMarket1559Tx,
  type LegacyTx,
} from '@ts-ethereum/tx'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
  equalsBytes,
  hexToBytes,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { EIP4844BlobTxReceipt, VM } from '@ts-ethereum/vm'
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

        const parentBlock = await node.chain.getBlock(block.header.parentHash)
        const tx = block.transactions[txIdx]
        const effectiveGasPrice = tx.supports(Capability.EIP1559FeeMarket)
          ? (tx as FeeMarket1559Tx).maxPriorityFeePerGas <
            (tx as FeeMarket1559Tx).maxFeePerGas - block.header.baseFeePerGas!
            ? (tx as FeeMarket1559Tx).maxPriorityFeePerGas
            : (tx as FeeMarket1559Tx).maxFeePerGas -
              block.header.baseFeePerGas! +
              block.header.baseFeePerGas!
          : (tx as LegacyTx).gasPrice

        const vmCopy = await vm!.shallowCopy()
        // vmCopy.common.setHardfork(tx.common.hardfork())
        const runBlockResult = await runBlock(vmCopy, {
          block,
          root: parentBlock.header.stateRoot,
          skipBlockValidation: true,
        })

        const { totalGasSpent, createdAddress } = runBlockResult.results[txIdx]
        const { blobGasPrice, blobGasUsed } = runBlockResult.receipts[
          txIdx
        ] as EIP4844BlobTxReceipt
        const jsonRpcReceipt = await toJSONRPCReceipt(
          receipt,
          totalGasSpent,
          effectiveGasPrice,
          block,
          tx,
          txIdx,
          logIndex,
          createdAddress as any,
          blobGasPrice,
          blobGasUsed,
        )
        return safeResult(jsonRpcReceipt)
      } catch (error) {
        return safeError(error as Error)
      }
    },
  )
}
