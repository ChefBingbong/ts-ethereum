/**
 * Handler for GET_POOLED_TRANSACTIONS request (0x09)
 * Processes incoming GET_POOLED_TRANSACTIONS requests and sends POOLED_TRANSACTIONS response
 */

import debug from 'debug'
import {
  ETH_MESSAGES,
  EthMessageCode,
} from '../../../../client/net/protocol/eth/definitions'
import type { TypedTransaction } from '@ts-ethereum/tx'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:get-pooled-transactions')

/**
 * Handle GET_POOLED_TRANSACTIONS request
 * Payload is already decoded: [reqId, hashes]
 */
export async function handleGetPooledTransactions(
  handler: EthHandler,
  payload: unknown,
): Promise<void> {
  try {
    // Payload is already decoded: [reqId, hashes]
    const decoded =
      ETH_MESSAGES[EthMessageCode.GET_POOLED_TRANSACTIONS].decode(payload)
    const { reqId, hashes } = decoded

    log('GET_POOLED_TRANSACTIONS: reqId=%d, hashes=%d', reqId, hashes.length)

    // Get transactions from tx pool via context
    let txs: TypedTransaction[] = []
    if (handler.context?.txPool) {
      for (const hash of hashes) {
        const tx = handler.context.txPool.getByHash([hash])
        if (tx) {
          txs.push(...tx)
        }
      }
    } else {
      log('GET_POOLED_TRANSACTIONS: txPool not available in context')
    }

    log('Sending %d transactions in response to reqId=%d', txs.length, reqId)

    const responseData = ETH_MESSAGES[
      EthMessageCode.POOLED_TRANSACTIONS
    ].encode({
      reqId,
      txs,
    })

    // Send using handler's sendMessage
    handler.sendMessage(EthMessageCode.POOLED_TRANSACTIONS, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_POOLED_TRANSACTIONS: %s', err.message)
    throw error
  }
}
