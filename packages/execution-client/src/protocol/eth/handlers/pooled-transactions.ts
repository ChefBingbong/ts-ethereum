/**
 * Handler for POOLED_TRANSACTIONS response (0x0a)
 * Processes incoming POOLED_TRANSACTIONS responses to GET_POOLED_TRANSACTIONS requests
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:pooled-transactions')

/**
 * Handle POOLED_TRANSACTIONS response
 * Payload is already decoded: [reqId, txs]
 */
export function handlePooledTransactions(
  handler: EthHandler,
  payload: unknown,
): void {
  try {
    const decoded = ETH_MESSAGES[EthMessageCode.POOLED_TRANSACTIONS].decode(
      payload as any,
      {
        chainCommon: handler.config.hardforkManager,
        chain: { headers: { latest: handler.chain.blocks.latest?.header } },
        syncTargetHeight: handler.config.syncTargetHeight,
      },
    ) as { reqId: bigint; txs: unknown[] } | [bigint, unknown[]]

    // Handle both object and tuple formats
    const reqId = Array.isArray(decoded) ? decoded[0] : decoded.reqId
    const txs = Array.isArray(decoded) ? decoded[1] : decoded.txs

    log('POOLED_TRANSACTIONS response: reqId=%d, txs=%d', reqId, txs.length)

    // Resolve pending request if exists
    const resolver = handler.resolvers.get(reqId)
    if (resolver) {
      clearTimeout(resolver.timeout)
      handler.resolvers.delete(reqId)
      resolver.resolve([reqId, txs])
      log('Resolved GET_POOLED_TRANSACTIONS request for reqId=%d', reqId)
    } else {
      // No pending request, emit as event for service layer
      handler.emit('message', {
        code: EthMessageCode.POOLED_TRANSACTIONS,
        name: 'PooledTransactions',
        data: { reqId, txs },
      })
    }
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling POOLED_TRANSACTIONS: %s', err.message)
    handler.emit('error', err)
  }
}
