import type { ExecutionNode } from '../../../node/index'
import { NetRpcMethods, RpcMethods } from '../types'
import { listening } from './listening'
import { peerCount } from './peer-count'
import { version } from './version'

export const createNetRpcMethods = (
  node: ExecutionNode,
): RpcMethods<typeof NetRpcMethods> => {
  return {
    net_version: version(node),
    net_listening: listening(node),
    net_peerCount: peerCount(node),
  }
}
