/**
 * Handler for RECEIPTS response (0x10)
 * Processes incoming RECEIPTS responses to GET_RECEIPTS requests
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:receipts')

/**
 * Handle RECEIPTS response
 * Payload is already decoded: [reqId, receipts]
 */
export function handleReceipts(handler: EthHandler, payload: unknown): void {
  try {
    const decoded = ETH_MESSAGES[EthMessageCode.RECEIPTS].decode(payload as any)
    const reqId = decoded[0] as bigint
    const receipts = decoded[1] as unknown[]

    log('RECEIPTS response: reqId=%d, receipts=%d', reqId, receipts.length)

    // Resolve pending request if exists
    const resolver = handler.resolvers.get(reqId)
    if (resolver) {
      clearTimeout(resolver.timeout)
      handler.resolvers.delete(reqId)
      resolver.resolve([reqId, receipts])
      log('Resolved GET_RECEIPTS request for reqId=%d', reqId)
    } else {
      // No pending request, emit as event for service layer
      handler.emit('message', {
        code: EthMessageCode.RECEIPTS,
        name: 'Receipts',
        data: { reqId, receipts },
      })
    }
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling RECEIPTS: %s', err.message)
    handler.emit('error', err)
  }
}
