/**
 * Handler for NEW_BLOCK_HASHES announcement (0x01)
 * Processes incoming NEW_BLOCK_HASHES announcements
 */

import debug from 'debug'
import {
	ETH_MESSAGES,
	EthMessageCode,
} from '../../../../client/net/protocol/eth/definitions'
import { handleNewBlockHashes as handleNewBlockHashesExec } from '../../../../client/net/protocol/eth/handlers'
import type { EthHandler } from '../handler'

const log = debug('p2p:eth:handlers:new-block-hashes')

/**
 * Handle NEW_BLOCK_HASHES announcement
 * Payload is already decoded: array of [hash, number]
 */
export function handleNewBlockHashes(
  handler: EthHandler,
  payload: unknown,
): void {
  try {
    const decoded =
      ETH_MESSAGES[EthMessageCode.NEW_BLOCK_HASHES].decode(payload)

    // If context is available, call execution handler directly
    if (handler.context) {
      handleNewBlockHashesExec(decoded, handler.context)
      return
    }

    // Otherwise emit event for backward compatibility
    handler.emit('message', {
      code: EthMessageCode.NEW_BLOCK_HASHES,
      name: 'NewBlockHashes',
      data: decoded,
    })
  } catch (error: unknown) {
    const err = error as Error
    log('Error handling NEW_BLOCK_HASHES: %s', err.message)
    handler.emit('error', err)
  }
}
