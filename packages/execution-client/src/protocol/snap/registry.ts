/**
 * SNAP Protocol Handler Registry
 *
 * Manages registration and routing of request/response handlers for SNAP protocol messages.
 */

import debug from 'debug'
import type { SnapMessageCode } from '../../net/protocol/snap/definitions'
import type { SnapHandler } from './handler'

const log = debug('p2p:snap:registry')

/**
 * Handler function type for processing incoming messages
 */
export type SnapMessageHandler = (
  handler: SnapHandler,
  payload: any,
) => Promise<void> | void

/**
 * Registry for SNAP protocol message handlers
 */
export class SnapHandlerRegistry {
  private protocolHandlers: Map<SnapMessageCode, SnapMessageHandler> = new Map()

  registerProtocolHandler(
    code: SnapMessageCode,
    handler: SnapMessageHandler,
  ): void {
    if (this.protocolHandlers.has(code)) {
      throw new Error(
        `Protocol handler for code: 0x${code.toString(16)} already registered`,
      )
    }
    this.protocolHandlers.set(code, handler)
    log('Registered protocol handler for code: 0x%02x', code)
  }

  getHandler(code: SnapMessageCode): SnapMessageHandler | undefined {
    return this.protocolHandlers.get(code)
  }

  hasHandler(code: SnapMessageCode): boolean {
    return this.protocolHandlers.has(code)
  }

  unregisterHandler(code: SnapMessageCode): void {
    this.protocolHandlers.delete(code)
    log('Unregistered handler for code: 0x%02x', code)
  }

  clear(): void {
    this.protocolHandlers.clear()
    log('Cleared all handlers')
  }
}
