/**
 * Handler for GET_STORAGE_RANGES request (0x02)
 * Processes incoming GET_STORAGE_RANGES requests and sends STORAGE_RANGES response
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

const log = debug('p2p:snap:handlers:get-storage-ranges')

/**
 * Handle GET_STORAGE_RANGES request
 * Payload is already decoded by devp2p protocol: [reqId, root, accounts, origin, limit, bytes]
 */
export async function handleGetStorageRanges(
  handler: SnapHandler,
  payload: unknown,
): Promise<void> {
  try {
    const decoded = SNAP_MESSAGES[SnapMessageCode.GET_STORAGE_RANGES].decode(
      payload as any,
    )
    const { reqId, root, accounts, origin, limit, bytes } = decoded

    log(
      'GET_STORAGE_RANGES: reqId=%d, accounts=%d, bytes=%d',
      reqId,
      accounts.length,
      bytes,
    )

    // TODO: Implement actual storage range fetching from state trie
    // For now, return empty response as most clients don't serve snap data
    const slots: any[][] = []
    const proof: Uint8Array[] = []

    // Encode response using protocol definitions
    const responseData = SNAP_MESSAGES[SnapMessageCode.STORAGE_RANGES].encode({
      reqId,
      slots,
      proof,
    })

    // Send response
    handler.sendMessage(SnapMessageCode.STORAGE_RANGES, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_STORAGE_RANGES: %s', err.message)
    throw error
  }
}
