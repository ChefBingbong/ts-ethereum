/**
 * SNAP Protocol Handlers
 *
 * Exports all message handlers and provides registration function
 */

import { SnapMessageCode } from '../../../net/protocol/snap/definitions'
import type { SnapHandlerRegistry } from '../registry'
import { handleGetAccountRange } from './account-range'
import { handleGetByteCodes } from './byte-codes'
import { handleGetStorageRanges } from './storage-ranges'
import { handleGetTrieNodes } from './trie-nodes'

/**
 * Register all default handlers with the registry
 * This function is called by SnapHandler during initialization
 */
export function registerDefaultSnapHandlers(
  registry: SnapHandlerRegistry,
): void {
  // Register request handlers (for serving snap sync data to peers)
  registry.registerProtocolHandler(
    SnapMessageCode.GET_ACCOUNT_RANGE,
    handleGetAccountRange,
  )
  registry.registerProtocolHandler(
    SnapMessageCode.GET_STORAGE_RANGES,
    handleGetStorageRanges,
  )
  registry.registerProtocolHandler(
    SnapMessageCode.GET_BYTE_CODES,
    handleGetByteCodes,
  )
  registry.registerProtocolHandler(
    SnapMessageCode.GET_TRIE_NODES,
    handleGetTrieNodes,
  )

  // Note: Response handlers (ACCOUNT_RANGE, STORAGE_RANGES, etc.) are handled
  // directly in SnapHandler.handleMessage() by resolving pending request promises
}

// Export all handlers for direct access if needed
export {
  handleGetAccountRange,
  handleGetByteCodes,
  handleGetStorageRanges,
  handleGetTrieNodes,
}
