/**
 * Handler for GET_BYTE_CODES request (0x04)
 * Processes incoming GET_BYTE_CODES requests and sends BYTE_CODES response
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

const log = debug('p2p:snap:handlers:get-byte-codes')

/**
 * Handle GET_BYTE_CODES request
 * Payload is already decoded by devp2p protocol: [reqId, hashes, bytes]
 */
export async function handleGetByteCodes(
  handler: SnapHandler,
  payload: unknown,
): Promise<void> {
  try {
    const decoded = SNAP_MESSAGES[SnapMessageCode.GET_BYTE_CODES].decode(
      payload as any,
    )
    const { reqId, hashes, bytes } = decoded

    log(
      'GET_BYTE_CODES: reqId=%d, hashes=%d, bytes=%d',
      reqId,
      hashes.length,
      bytes,
    )

    // TODO: Implement actual bytecode fetching from state
    // For now, return empty response as most clients don't serve snap data
    const codes: Uint8Array[] = []

    // Encode response using protocol definitions
    const responseData = SNAP_MESSAGES[SnapMessageCode.BYTE_CODES].encode({
      reqId,
      codes,
    })

    // Send response
    handler.sendMessage(SnapMessageCode.BYTE_CODES, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_BYTE_CODES: %s', err.message)
    throw error
  }
}
