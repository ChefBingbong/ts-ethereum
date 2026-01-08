/**
 * Handler for GET_TRIE_NODES request (0x06)
 * Processes incoming GET_TRIE_NODES requests and sends TRIE_NODES response
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

const log = debug('p2p:snap:handlers:get-trie-nodes')

/**
 * Handle GET_TRIE_NODES request
 * Payload is already decoded by devp2p protocol: [reqId, root, paths, bytes]
 */
export async function handleGetTrieNodes(
  handler: SnapHandler,
  payload: unknown,
): Promise<void> {
  try {
    const decoded = SNAP_MESSAGES[SnapMessageCode.GET_TRIE_NODES].decode(
      payload as any,
    )
    const { reqId, root, paths, bytes } = decoded

    log(
      'GET_TRIE_NODES: reqId=%d, paths=%d, bytes=%d',
      reqId,
      paths.length,
      bytes,
    )

    // TODO: Implement actual trie node fetching
    // For now, return empty response as most clients don't serve snap data
    const nodes: Uint8Array[] = []

    // Encode response using protocol definitions
    const responseData = SNAP_MESSAGES[SnapMessageCode.TRIE_NODES].encode({
      reqId,
      nodes,
    })

    // Send response
    handler.sendMessage(SnapMessageCode.TRIE_NODES, responseData)
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling GET_TRIE_NODES: %s', err.message)
    throw error
  }
}
