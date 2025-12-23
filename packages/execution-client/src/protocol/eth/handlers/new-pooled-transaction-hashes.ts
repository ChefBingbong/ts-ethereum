/**
 * Handler for NEW_POOLED_TRANSACTION_HASHES announcement (0x08)
 * Processes incoming NEW_POOLED_TRANSACTION_HASHES announcements
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import { handleNewPooledTransactionHashes as handleNewPooledTransactionHashesExec } from '../../../net/protocol/eth/handlers'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:new-pooled-transaction-hashes')

/**
 * Handle NEW_POOLED_TRANSACTION_HASHES announcement
 * Payload is already decoded: array or tuple format
 */
export async function handleNewPooledTransactionHashes(
  handler: EthHandler,
  payload:
    | Uint8Array<ArrayBufferLike>[]
    | [
        types: `0x${string}`,
        sizes: number[],
        hashes: Uint8Array<ArrayBufferLike>[],
      ],
): Promise<void> {
  try {
    const decoded = ETH_MESSAGES[
      EthMessageCode.NEW_POOLED_TRANSACTION_HASHES
    ].decode(payload as any)

    // If context is available, call execution handler directly
    if (handler.context) {
      const peer = handler.findPeer()
      if (peer) {
        await handleNewPooledTransactionHashesExec(
          decoded as any,
          peer,
          handler.context,
        )
        return
      }
    }

    // Otherwise emit event for backward compatibility
    handler.emit('message', {
      code: EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
      name: 'NewPooledTransactionHashes',
      data: decoded,
    })
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling NEW_POOLED_TRANSACTION_HASHES: %s', err.message)
    handler.emit('error', err)
  }
}
