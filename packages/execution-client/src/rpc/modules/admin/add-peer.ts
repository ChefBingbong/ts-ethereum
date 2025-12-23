import { safeError, safeResult, safeTry } from '@ts-ethereum/utils'
import z from 'zod'
import { DPT } from '../../../net/dpt-1/index'
import type { ExecutionNode } from '../../../node/index'
// RPC admin addPeer - TODO: Update for P2P architecture
// import { P2PPeer } from "../../../net/peer/p2p-peer.ts";
import { createRpcMethod } from '../../validation'
import { peerInfoSchema } from './schema'

export const addPeer = (node: ExecutionNode, dpt: DPT) =>
  createRpcMethod(z.array(peerInfoSchema).length(1), async (params) => {
    const [error, peerInfo] = await safeTry(() => dpt.addPeer(params[0]))
    if (error) return safeError(error)

    // TODO: Update for P2P architecture - Peer creation is handled by Network
    // node.network.addPeer(...);

    return safeResult(peerInfo !== undefined)
  })
