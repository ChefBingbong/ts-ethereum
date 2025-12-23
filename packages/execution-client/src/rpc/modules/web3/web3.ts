import type { ExecutionNode } from '../../../node/index'
import { RpcMethods, Web3RpcMethods } from '../types'
import { clientVersion } from './client-version'
import { sha3 } from './sha3'

export const createWeb3RpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof Web3RpcMethods> => {
  return {
    web3_clientVersion: clientVersion(node),
    web3_sha3: sha3(node),
  }
}
