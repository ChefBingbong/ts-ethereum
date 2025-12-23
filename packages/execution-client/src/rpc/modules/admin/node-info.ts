import { bytesToHex, safeError, safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getClientVersion } from '../../../util/index'
import { createRpcMethod } from '../../validation'
import { nodeInfoSchema } from './schema'

export const nodeInfo = (node: ExecutionNode) =>
  createRpcMethod(nodeInfoSchema, async (_params, _c) => {
    try {
      const rlpxInfo = {} as any
      if (!rlpxInfo) {
        return safeError(new Error('RLPx info not found'))
      }
      const latestHeader = node.chain.headers.latest!
      const clientName = getClientVersion()

      return safeResult({
        name: clientName,
        enode: `enode://${rlpxInfo.id}@${rlpxInfo.listenAddr}`,
        id: rlpxInfo.id,
        ip: rlpxInfo.ip,
        listenAddr: rlpxInfo.listenAddr,
        ports: {
          discovery: rlpxInfo.ports.discovery,
          listener: rlpxInfo.ports.listener,
        },
        protocols: {
          eth: {
            difficulty: latestHeader.difficulty.toString(),
            genesis: bytesToHex(node.chain.genesis.hash()),
            head: bytesToHex(latestHeader.mixHash),
            network: node.chain.chainId.toString(),
          },
        },
      })
    } catch (error) {
      return safeError(error as Error)
    }
  })
