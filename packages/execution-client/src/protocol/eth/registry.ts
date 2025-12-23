/**
 * ETH Protocol Handler Registry
 *
 * Manages registration and routing of request/response handlers for ETH protocol messages.
 * Similar to libp2p's handler registration pattern but adapted for RLPxConnection.
 */

import debug from 'debug'
import { EthMessageCode } from '../../../client/net/protocol/eth/definitions'
import type { EthHandler } from './handler'

const log = debug('p2p:eth:registry')

/**
 * Handler function type for processing incoming messages
 */
export type MessageHandler = (
  handler: EthHandler,
  payload: any,
) => Promise<void> | void

/**
 * Registry for ETH protocol message handlers
 */
export class EthHandlerRegistry {
  private protocolHandlers: Map<EthMessageCode, MessageHandler> = new Map()

  registerProtocolHandler(code: EthMessageCode, handler: MessageHandler): void {
    if (this.protocolHandlers.has(code)) {
      throw new Error(
        `Protocol handler for code: 0x${code.toString(16)} already registered`,
      )
    }
    this.protocolHandlers.set(code, handler)
    log('Registered protocol handler for code: 0x%02x', code)
  }

  getHandler(code: EthMessageCode): MessageHandler | undefined {
    return this.protocolHandlers.get(code)
  }

  hasHandler(code: EthMessageCode): boolean {
    return this.protocolHandlers.has(code)
  }

  unregisterHandler(code: EthMessageCode): void {
    this.protocolHandlers.delete(code)
    log('Unregistered handler for code: 0x%02x', code)
  }

  clear(): void {
    this.protocolHandlers.clear()
    log('Cleared all handlers')
  }
}
