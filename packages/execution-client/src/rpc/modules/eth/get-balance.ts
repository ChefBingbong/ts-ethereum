import {
	bigIntToHex,
	createAddressFromString,
	EthereumJSErrorWithoutCode,
} from '@ts-ethereum/utils'
import { safeError, safeResult } from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getBalanceSchema } from './schema'

export const getBalance = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(
    getBalanceSchema,
    async (params: [string, string], _c) => {
      const [addressHex, blockOpt] = params
      const address = createAddressFromString(addressHex)
      const block = await getBlockByOption(blockOpt, chain)

      if (vm === undefined) {
        return safeError(EthereumJSErrorWithoutCode('missing vm'))
      }

      const vmCopy = await vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)
      const account = await vmCopy.stateManager.getAccount(address)
      if (account === undefined) {
        return safeResult('0x0')
      }
      return safeResult(bigIntToHex(account.balance))
    },
  )
}
