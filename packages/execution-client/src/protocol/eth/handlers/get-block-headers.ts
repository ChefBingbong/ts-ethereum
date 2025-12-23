/**
 * Handler for GET_BLOCK_HEADERS request (0x03)
 * Processes incoming GET_BLOCK_HEADERS requests and sends BLOCK_HEADERS response
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:get-block-headers')

/**
 * Handle GET_BLOCK_HEADERS request
 * Payload is already decoded by devp2p protocol: [reqId, [block, max, skip, reverse]]
 */
export async function handleGetBlockHeaders(
  handler: EthHandler,
  payload: unknown,
): Promise<void> {
  try {
    // Payload is already decoded: [reqId, [block, max, skip, reverse]]
    // Use protocol definitions to decode (handles both formats)
    const decoded = ETH_MESSAGES[EthMessageCode.GET_BLOCK_HEADERS].decode(
      payload as any,
    )
    const { reqId, block, max, skip, reverse } = decoded

    log(
      'GET_BLOCK_HEADERS: reqId=%d, block=%s, max=%d, skip=%d, reverse=%s',
      reqId,
      typeof block === 'bigint' ? block.toString() : 'hash',
      max,
      skip,
      reverse,
    )

    // Get headers from chain
    const headers = await handler.chain.getHeaders(block, max, skip, reverse)

    log('Sending %d headers in response to reqId=%d', headers.length, reqId)

    // Encode response using protocol definitions
    const responseData = ETH_MESSAGES[EthMessageCode.BLOCK_HEADERS].encode({
      reqId,
      headers,
    })

    // Send using handler's sendMessage
    handler.sendMessage(EthMessageCode.BLOCK_HEADERS, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_BLOCK_HEADERS: %s', err.message)
    throw error
  }
}
