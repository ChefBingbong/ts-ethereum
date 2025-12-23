import type { Block } from '@ts-ethereum/block'
import {
	BIGINT_0,
	bigIntToHex,
	createAddressFromString,
} from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getTransactionCountSchema } from './schema'

export const getTransactionCount = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(
    getTransactionCountSchema,
    async (params: [string, string], _c) => {
      const [addressHex, blockOpt] = params
      let block: Block
      if (blockOpt !== 'pending')
        block = await getBlockByOption(blockOpt, chain)
      else block = await getBlockByOption('latest', chain)

      if (vm === undefined) {
        return safeError(new Error('missing vm'))
      }

      const vmCopy = await vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

      const address = createAddressFromString(addressHex)
      const account = await vmCopy.stateManager.getAccount(address)
      if (account === undefined) {
        return safeResult('0x0')
      }

      let pendingTxsCount = BIGINT_0

      if (blockOpt === 'pending') {
        const txPool = node.txPool
        const addr = addressHex.slice(2).toLowerCase()
        const pendingTxs = txPool.pending.get(addr)?.length ?? 0
        const queuedTxs = txPool.queued.get(addr)?.length ?? 0
        pendingTxsCount = BigInt(pendingTxs + queuedTxs)
      }
      return safeResult(bigIntToHex(account.nonce + pendingTxsCount))
    },
  )
}
