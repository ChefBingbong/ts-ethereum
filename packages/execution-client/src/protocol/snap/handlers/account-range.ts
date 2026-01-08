/**
 * Handler for GET_ACCOUNT_RANGE request (0x00)
 * Processes incoming GET_ACCOUNT_RANGE requests and sends ACCOUNT_RANGE response
 *
 * Note: This handler is for serving snap sync requests to other peers.
 * Most execution clients only request data, not serve it, unless they are archive nodes.
 */

import debug from 'debug'
import {
  SNAP_MESSAGES,
  SnapMessageCode,
} from '../../../net/protocol/snap/definitions'
import type { SnapHandler } from '../handler'

const log = debug('p2p:snap:handlers:get-account-range')

/**
 * Handle GET_ACCOUNT_RANGE request
 * Payload is already decoded by devp2p protocol: [reqId, root, origin, limit, bytes]
 */
export async function handleGetAccountRange(
  handler: SnapHandler,
  payload: unknown,
): Promise<void> {
  try {
    const decoded = SNAP_MESSAGES[SnapMessageCode.GET_ACCOUNT_RANGE].decode(
      payload as any,
    )
    const { reqId, root, origin, limit, bytes } = decoded

    log(
      'GET_ACCOUNT_RANGE: reqId=%d, root=%s, bytes=%d',
      reqId,
      root.slice(0, 8).toString('hex'),
      bytes,
    )

    // TODO: Implement actual account range fetching from state trie
    // For now, return empty response as most clients don't serve snap data
    const accounts: any[] = []
    const proof: Uint8Array[] = []

    // Encode response using protocol definitions
    const responseData = SNAP_MESSAGES[SnapMessageCode.ACCOUNT_RANGE].encode({
      reqId,
      accounts,
      proof,
    })

    // Send response
    handler.sendMessage(SnapMessageCode.ACCOUNT_RANGE, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_ACCOUNT_RANGE: %s', err.message)
    throw error
  }
}
