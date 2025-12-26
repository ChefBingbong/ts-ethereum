import {
  bytesToHex,
  createAddressFromString,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  safeError,
  safeResult,
  TypeOutput,
  toType,
} from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import type { RPCTx } from '../../types'
import { createRpcMethod } from '../../validation'
import { callSchema } from './schema'

export const call = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(callSchema, async (params: [RPCTx, string], _c) => {
    const [transaction, blockOpt] = params
    const block = await getBlockByOption(blockOpt, chain)

    if (vm === undefined) {
      return safeError(EthereumJSErrorWithoutCode('missing vm'))
    }

    const vmCopy = await vm.shallowCopy()
    await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

    const { from, to, gas: gasLimit, gasPrice, value } = transaction

    const data = transaction.data ?? transaction.input

    const runCallOpts = {
      caller: from !== undefined ? createAddressFromString(from) : undefined,
      to: to !== undefined ? createAddressFromString(to) : undefined,
      gasLimit:
        gasLimit !== undefined
          ? toType(gasLimit, TypeOutput.BigInt)
          : undefined,
      gasPrice:
        gasPrice !== undefined
          ? toType(gasPrice, TypeOutput.BigInt)
          : undefined,
      value: value !== undefined ? toType(value, TypeOutput.BigInt) : undefined,
      data: data !== undefined ? hexToBytes(data) : undefined,
      block,
      skipBalance: true,
    }

    console.log('runCallOpts', runCallOpts)
    const { execResult } = await vmCopy.evm.runCall(runCallOpts)

    if (execResult.exceptionError !== undefined) {
      // Throw error with code 3 and return value as data (following ethereumjs pattern)
      // This gets caught by the RPC handler and formatted properly
      throw {
        code: 3,
        data: bytesToHex(execResult.returnValue),
        message: execResult.exceptionError.error,
      }
    }

    return safeResult(bytesToHex(execResult.returnValue))
  })
}
