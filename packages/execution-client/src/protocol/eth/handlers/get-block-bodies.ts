/**
 * Handler for GET_BLOCK_BODIES request (0x05)
 * Processes incoming GET_BLOCK_BODIES requests and sends BLOCK_BODIES response
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../../client/net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:get-block-bodies')

/**
 * Handle GET_BLOCK_BODIES request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetBlockBodies(
  handler: EthHandler,
  payload: unknown,
): Promise<void> {
  try {
    // Payload is already decoded: [reqId, hashes]
    const decoded =
      ETH_MESSAGES[EthMessageCode.GET_BLOCK_BODIES].decode(payload)
    const { reqId, hashes } = decoded

    log('GET_BLOCK_BODIES: reqId=%d, hashes=%d', reqId, hashes.length)

    // Get blocks from chain
    const blocks = await Promise.all(
      hashes.map((hash) => handler.chain.getBlock(hash)),
    )

    // Extract bodies: [transactions, uncles]
    // Block.raw() returns [header, transactions, uncles]
    // BlockBodyBytes is [transactions, uncles] - slice(1) removes header
    const bodies = blocks.map((block) => block.raw().slice(1) as unknown)

    log('Sending %d bodies in response to reqId=%d', bodies.length, reqId)

    const responseData = ETH_MESSAGES[EthMessageCode.BLOCK_BODIES].encode({
      reqId,
      bodies,
    })

    // Send using handler's sendMessage
    handler.sendMessage(EthMessageCode.BLOCK_BODIES, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_BLOCK_BODIES: %s', err.message)
    throw error
  }
}
