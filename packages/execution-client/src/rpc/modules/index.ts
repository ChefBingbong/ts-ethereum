import type { ExecutionNode } from '../../node/index'
import type { RpcMethodFn } from '../types'
import { createRpcHandler } from '../validation'
import { createAdminRpcMethods } from './admin/admin'
import { createDebugRpcMethods } from './debug/index'
import { createEngineRpcMethods } from './engine/engine'
import { createEthRpcMethods } from './eth/eth'
import { createNetRpcMethods } from './net/net'
import { createTxPoolRpcMethods } from './txpool/txpool'
import type { AllRpcMethods } from './types'
import { createWeb3RpcMethods } from './web3/web3'

export const list = [
  'Eth',
  'Web3',
  'node:net',
  'Admin',
  'TxPool',
  'Debug',
  'Engine',
]

// New functional module exports
export * from './admin/index'
export * from './debug/index'
export * from './engine/index'
// Backward compatibility: export old class-based modules
export * from './eth/index'
export * from './net/index'
export * from './txpool/index'
export * from './web3/index'

export const createRpcHandlers = (node: ExecutionNode, debug: boolean) => {
  const methods: Record<AllRpcMethods, RpcMethodFn> = {
    ...createAdminRpcMethods(node),
    ...createEthRpcMethods(node),
    ...createNetRpcMethods(node),
    ...createTxPoolRpcMethods(node),
    ...createWeb3RpcMethods(node),
    ...createDebugRpcMethods(node),
    ...createEngineRpcMethods(node),
  }
  return {
    rpcHandlers: createRpcHandler(methods, { debug }),
    methods: Object.keys(methods),
  }
}
