import type { Proof } from '@ts-ethereum/state-manager'
import { MerkleStateManager } from '@ts-ethereum/state-manager'
import type { PrefixedHexString } from '@ts-ethereum/utils'
import {
  EthereumJSErrorWithoutCode,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import type { VM } from '@ts-ethereum/vm'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getProofSchema } from './schema'

export const getProof = (node: ExecutionNode) => {
  const chain = node.chain
  const vm: VM | undefined = node.execution?.vm
  return createRpcMethod(
    getProofSchema,
    async (
      params: [PrefixedHexString, PrefixedHexString[], PrefixedHexString],
      _c,
    ) => {
      const [, , blockOpt] = params
      const block = await getBlockByOption(blockOpt, chain)

      if (vm === undefined) {
        return safeError(EthereumJSErrorWithoutCode('missing vm'))
      }

      const vmCopy = await vm.shallowCopy()
      await vmCopy.stateManager.setStateRoot(block.header.stateRoot)

      // const address = createAddressFromString(addressHex)
      // const slots = slotsHex.map((slotHex) =>
      //   setLengthLeft(hexToBytes(slotHex), 32),
      // )
      let proof: Proof | null = null
      if (vmCopy.stateManager instanceof MerkleStateManager) {
        proof = null
      } else {
        return safeError(
          EthereumJSErrorWithoutCode(
            'getProof RPC method not supported with the StateManager provided',
          ),
        )
      }

      return safeResult(proof)
    },
  )
}
