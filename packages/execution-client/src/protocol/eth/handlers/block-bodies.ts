/**
 * Handler for BLOCK_BODIES response (0x06)
 * Processes incoming BLOCK_BODIES responses to GET_BLOCK_BODIES requests
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:block-bodies')

/**
 * Handle BLOCK_BODIES response
 * Payload is already decoded: [reqId, bodies]
 */
export function handleBlockBodies(handler: EthHandler, payload: unknown): void {
  try {
    const decoded = ETH_MESSAGES[EthMessageCode.BLOCK_BODIES].decode(
      payload as any,
    )
    const reqId = decoded[0] as bigint
    const bodies = decoded[1] as unknown[]

    log('BLOCK_BODIES response: reqId=%d, bodies=%d', reqId, bodies.length)

    // Resolve pending request if exists
    const resolver = handler.resolvers.get(reqId)
    if (resolver) {
      clearTimeout(resolver.timeout)
      handler.resolvers.delete(reqId)
      resolver.resolve([reqId, bodies])
      log('Resolved GET_BLOCK_BODIES request for reqId=%d', reqId)
    } else {
      // No pending request, emit as event for service layer
      handler.emit('message', {
        code: EthMessageCode.BLOCK_BODIES,
        name: 'BlockBodies',
        data: { reqId, bodies },
      })
    }
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling BLOCK_BODIES: %s', err.message)
    handler.emit('error', err)
  }
}
