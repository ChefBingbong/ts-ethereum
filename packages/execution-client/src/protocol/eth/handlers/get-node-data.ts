/**
 * Handler for GET_NODE_DATA request (0x0d)
 * Processes incoming GET_NODE_DATA requests and sends NODE_DATA response
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../../client/net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:get-node-data')

/**
 * Handle GET_NODE_DATA request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetNodeData(
  handler: EthHandler,
  payload: unknown,
): Promise<void> {
  try {
    // Payload is already decoded: [reqId, hashes]
    const decoded = ETH_MESSAGES[EthMessageCode.GET_NODE_DATA].decode(payload)
    const { reqId, hashes } = decoded

    log('GET_NODE_DATA: reqId=%d, hashes=%d', reqId, hashes.length)

    // Get node data from state manager
    // TODO: Implement node data retrieval from state manager
    // For now, return empty array
    const nodes: Uint8Array[] = []

    log('Sending %d nodes in response to reqId=%d', nodes.length, reqId)

    const responseData = ETH_MESSAGES[EthMessageCode.NODE_DATA].encode({
      reqId,
      data: nodes,
    })

    // Send using handler's sendMessage
    handler.sendMessage(EthMessageCode.NODE_DATA, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_NODE_DATA: %s', err.message)
    throw error
  }
}
