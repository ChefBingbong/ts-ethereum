import { TransactionType } from '@ts-ethereum/tx'
import {
  bytesToHex,
  EthereumJSErrorWithoutCode,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import { encodeReceipt, TxReceipt } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getRawReceiptsSchema } from './schema'

export const getRawReceipts = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(getRawReceiptsSchema, async (params: [string], _c) => {
    const [blockOpt] = params
    if (!node.execution.execution.receiptsManager)
      return safeError(EthereumJSErrorWithoutCode('missing receiptsManager'))
    const block = await getBlockByOption(blockOpt, chain)
    const receipts = await node.execution.execution.receiptsManager.getReceipts(
      block.hash(),
      true,
      true,
    )
    return safeResult(
      receipts.map((r) =>
        bytesToHex(
          encodeReceipt(
            r as unknown as TxReceipt,
            r.txType as unknown as TransactionType,
          ),
        ),
      ),
    )
  })
}
