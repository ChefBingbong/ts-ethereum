import {
  bytesToHex,
  createAddressFromString,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  type PrefixedHexString,
  safeError,
  safeResult,
  setLengthLeft,
} from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getStorageAtSchema } from './schema'

const EMPTY_SLOT = `0x${'00'.repeat(32)}`

export const getStorageAt = (node: ExecutionNode) => {
  const chain = node.chain
  const vm = node.execution?.vm
  return createRpcMethod(
    getStorageAtSchema,
    async (params: [string, PrefixedHexString, string], _c) => {
      const [addressHex, keyHex, blockOpt] = params

      if (!/^[0-9a-fA-F]+$/.test(keyHex.slice(2))) {
        return safeError(
          new Error(`unable to decode storage key: hex string invalid` as any),
        )
      }

      if (keyHex.length > 66) {
        return safeError(
          new Error(
            `unable to decode storage key: hex string too long, want at most 32 bytes` as any,
          ),
        )
      }

      if (blockOpt === 'pending') {
        return safeError(new Error('"pending" is not yet supported'))
      }

      if (vm === undefined) {
        return safeError(EthereumJSErrorWithoutCode('missing vm'))
      }

      const vmCopy = await vm.shallowCopy()
      const block = await getBlockByOption(blockOpt, chain)
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

      const address = createAddressFromString(addressHex)
      const account = await vmCopy.stateManager.getAccount(address)
      if (account === undefined) {
        return safeResult(EMPTY_SLOT)
      }

      const key = setLengthLeft(hexToBytes(keyHex), 32)
      const storage = await vmCopy.stateManager.getStorage(address, key)
      return safeResult(
        storage !== null && storage !== undefined
          ? bytesToHex(
              setLengthLeft(Uint8Array.from(storage) as Uint8Array, 32),
            )
          : EMPTY_SLOT,
      )
    },
  )
}
