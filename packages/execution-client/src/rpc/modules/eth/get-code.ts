import {
  bytesToHex,
  createAddressFromString,
  EthereumJSErrorWithoutCode,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getCodeSchema } from './schema'

export const getCode = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(
    getCodeSchema,
    async (params: [string, string], _c) => {
      const [addressHex, blockOpt] = params
      const block = await getBlockByOption(blockOpt, chain)

      if (vm === undefined) {
        return safeError(EthereumJSErrorWithoutCode('missing vm'))
      }

      const vmCopy = await vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

      const address = createAddressFromString(addressHex)
      const code = await vmCopy.stateManager.getCode(address)
      return safeResult(bytesToHex(code))
    },
  )
}

