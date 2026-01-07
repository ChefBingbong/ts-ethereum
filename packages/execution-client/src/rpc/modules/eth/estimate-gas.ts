import { createBlock } from '@ts-ethereum/block'
import { createTx } from '@ts-ethereum/tx'
import {
  BIGINT_1,
  createAddressFromString,
  createZeroAddress,
  EthereumJSErrorWithoutCode,
  safeResult,
} from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import { runTx } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import type { RPCTx } from '../../types'
import { createRpcMethod } from '../../validation'
import { estimateGasSchema } from './schema'

export const estimateGas = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(
    estimateGasSchema,
    async (params: [RPCTx, string?], _c) => {
      const [transaction, blockOpt] = params
      const block = await getBlockByOption(blockOpt ?? 'latest', chain)

      if (vm === undefined) {
        throw EthereumJSErrorWithoutCode('missing vm')
      }
      const vmCopy = await vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

      if (transaction.gas === undefined) {
        const latest = await chain.getCanonicalHeadHeader()
        transaction.gas = latest.gasLimit as any
      }

      const txData = {
        ...transaction,
        gasLimit: transaction.gas,
      }

      const blockToRunOn = createBlock(
        {
          header: {
            parentHash: block.hash(),
            number: block.header.number + BIGINT_1,
            timestamp: block.header.timestamp + BIGINT_1,
          },
        },
        { hardforkManager: vmCopy.hardforkManager },
      )

      const tx = createTx(txData, {
        common: vmCopy.hardforkManager,
        freeze: false,
      })

      const from =
        transaction.from !== undefined
          ? createAddressFromString(transaction.from)
          : createZeroAddress()
      tx.getSenderAddress = () => from

      const { totalGasSpent } = await runTx(vmCopy, {
        tx,
        skipNonce: true,
        skipBalance: true,
        skipBlockGasLimitValidation: true,
        block: blockToRunOn,
      })
      return safeResult(`0x${totalGasSpent.toString(16)}`)
    },
  )
}
