import type { Block } from '@ts-ethereum/block'
import { Capability, type FeeMarket1559Tx, type LegacyTx } from '@ts-ethereum/tx'
import {
  hexToBytes,
  isHexString,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { EIP4844BlobTxReceipt, VM } from '@ts-ethereum/vm'
import { runBlock } from '@ts-ethereum/vm'
import type { ReceiptsManager } from '../../../execution/receipt'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { toJSONRPCReceipt } from './helpers'
import { getBlockReceiptsSchema } from './schema'

export const getBlockReceipts = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  const receiptsManager: ReceiptsManager | undefined =
    node.execution.execution.receiptsManager
  return createRpcMethod(
    getBlockReceiptsSchema,
    async (params: [string], _c) => {
      const [blockOpt] = params
      let block: Block
      try {
        if (isHexString(blockOpt, 64)) {
          block = await chain.getBlock(hexToBytes(blockOpt))
        } else {
          block = await getBlockByOption(blockOpt, chain)
        }
      } catch {
        return safeResult(null)
      }
      const blockHash = block.hash()
      if (!receiptsManager)
        return safeError(new Error('missing receiptsManager'))
      const result = await receiptsManager.getReceipts(blockHash, true, true)
      if (result.length === 0) return safeResult([])
      const parentBlock = await chain.getBlock(block.header.parentHash)
      const vmCopy = await vm!.shallowCopy()
      const runBlockResult = await runBlock(vmCopy, {
        block,
        root: parentBlock.header.stateRoot,
        skipBlockValidation: true,
      })

      const receipts = await Promise.all(
        result.map(async (r, i) => {
          const tx = block.transactions[i]
          const { totalGasSpent, createdAddress } = runBlockResult.results[i]
          const { blobGasPrice, blobGasUsed } = runBlockResult.receipts[
            i
          ] as EIP4844BlobTxReceipt

          // Handle both legacy and EIP-1559 transactions
          const effectiveGasPrice = tx.supports(Capability.EIP1559FeeMarket)
            ? (tx as FeeMarket1559Tx).maxPriorityFeePerGas <
              (tx as FeeMarket1559Tx).maxFeePerGas - block.header.baseFeePerGas!
              ? (tx as FeeMarket1559Tx).maxPriorityFeePerGas +
                block.header.baseFeePerGas!
              : (tx as FeeMarket1559Tx).maxFeePerGas
            : (tx as LegacyTx).gasPrice

          return toJSONRPCReceipt(
            r,
            totalGasSpent,
            effectiveGasPrice,
            block,
            tx,
            i,
            i,
            createdAddress as any,
            blobGasPrice,
            blobGasUsed,
          )
        }),
      )
      return safeResult(receipts)
    },
  )
}
