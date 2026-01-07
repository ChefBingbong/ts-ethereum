/**
 * Handler for TRANSACTIONS announcement (0x02)
 * Processes incoming TRANSACTIONS announcements
 */

import type { TypedTransaction } from '@ts-ethereum/tx'
import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../net/protocol/eth/definitions'
import { handleTransactions as handleTransactionsExec } from '../../../net/protocol/eth/handlers'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:transactions')

/**
 * Handle TRANSACTIONS announcement
 * Payload is already decoded: array of transaction bytes
 */
export async function handleTransactions(
  handler: EthHandler,
  payload: unknown,
): Promise<void> {
  try {
    const decoded = ETH_MESSAGES[EthMessageCode.TRANSACTIONS].decode(
      payload as any,
      {
        chainCommon: handler.config.hardforkManager,
        synchronized: handler.isReady,
        chain: { headers: { latest: handler.chain.blocks.latest?.header } },
        syncTargetHeight: handler.config.syncTargetHeight,
      },
    )

    // If context is available, call execution handler directly
    if (handler.context) {
      const peer = handler.findPeer()
      if (peer) {
        await handleTransactionsExec(
          decoded as TypedTransaction[],
          peer,
          handler.context,
        )
        return
      }
    }

    // Otherwise emit event for backward compatibility
    handler.emit('message', {
      code: EthMessageCode.TRANSACTIONS,
      name: 'Transactions',
      data: decoded,
    })
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling TRANSACTIONS: %s', err.message)
    handler.emit('error', err)
  }
}
