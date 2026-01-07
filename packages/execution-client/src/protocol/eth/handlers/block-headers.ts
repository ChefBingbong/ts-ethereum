/**
 * Handler for BLOCK_HEADERS response (0x04)
 * Processes incoming BLOCK_HEADERS responses to GET_BLOCK_HEADERS requests
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:block-headers')

/**
 * Handle BLOCK_HEADERS response
 * Payload is already decoded: [reqId, headers]
 */
export function handleBlockHeaders(
  handler: EthHandler,
  payload: unknown,
): void {
  try {
    const decoded = ETH_MESSAGES[EthMessageCode.BLOCK_HEADERS].decode(
      payload as any,
      {
        chainCommon: handler.config.hardforkManager,
      },
    ) as [bigint, unknown[]]
    const reqId = decoded[0] as bigint
    const headers = decoded[1] as unknown[]

    log('BLOCK_HEADERS response: reqId=%d, headers=%d', reqId, headers.length)

    // Resolve pending request if exists
    const resolver = handler.resolvers.get(reqId)
    if (resolver) {
      clearTimeout(resolver.timeout)
      handler.resolvers.delete(reqId)
      resolver.resolve([reqId, headers])
      log('Resolved GET_BLOCK_HEADERS request for reqId=%d', reqId)
    } else {
      // No pending request, emit as event for service layer
      handler.emit('message', {
        code: EthMessageCode.BLOCK_HEADERS,
        name: 'BlockHeaders',
        data: { reqId, headers },
      })
    }
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling BLOCK_HEADERS: %s', err.message)
    handler.emit('error', err)
  }
}
