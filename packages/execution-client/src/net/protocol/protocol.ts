import type { Common } from '@ts-ethereum/chain-config'
import { devp2pDebug } from '@ts-ethereum/utils'
import type { Debugger } from 'debug'
import debugDefault from 'debug'
import { EventEmitter } from 'eventemitter3'
import type { ProtocolEvent, ProtocolType } from '../dpt-1/types'

type MessageCodes = { [key: number | string]: number | string }

/**
 * Protocol connection interface - provides what protocols need from connection/peer
 */
export interface ProtocolConnection {
  common: Common
  _socket: { remoteAddress?: string; remotePort?: number }
  _hello: { protocolVersion: number } | null
  sendSubprotocolMessage?(code: number, data: Uint8Array): boolean
  _addFirstPeerDebugger?(): void
}

/**
 * Handler function type for processing incoming messages
 */
export type ProtocolMessageHandler = (
  code: number,
  payload: Uint8Array | unknown,
) => Promise<void> | void

/**
 * Protocol handler registry - stores handlers for message codes
 */
class ProtocolHandlerRegistry {
  private handlers: Map<number, ProtocolMessageHandler> = new Map()

  register(code: number, handler: ProtocolMessageHandler): void {
    this.handlers.set(code, handler)
  }

  get(code: number): ProtocolMessageHandler | undefined {
    return this.handlers.get(code)
  }

  has(code: number): boolean {
    return this.handlers.has(code)
  }

  clear(): void {
    this.handlers.clear()
  }
}

export abstract class Protocol {
  public events: EventEmitter<ProtocolEvent>
  protected _version: number
  protected _peer: ProtocolConnection
  protected _connection: ProtocolConnection
  protected _statusTimeoutId?: NodeJS.Timeout
  protected _messageCodes: MessageCodes
  private _debug: Debugger
  protected _verbose: boolean
  protected _protocolOffset = 0
  protected _registry: ProtocolHandlerRegistry = new ProtocolHandlerRegistry()

  /**
   * Will be set to the first successfully connected peer to allow for
   * debugging with the `devp2p:FIRST_PEER` debugger
   */
  _firstPeer = ''

  // Message debuggers (e.g. { 'GET_BLOCK_HEADERS': [debug Object], ...})
  protected msgDebuggers: { [key: string]: (debug: string) => void } = {}

  constructor(
    peer: ProtocolConnection,
    protocol: ProtocolType,
    version: number,
    messageCodes: MessageCodes,
    protocolOffset?: number,
  ) {
    this.events = new EventEmitter<ProtocolEvent>()
    this._peer = peer
    this._connection = peer as ProtocolConnection
    this._version = version
    this._messageCodes = messageCodes
    this._protocolOffset = protocolOffset ?? 0
    this._statusTimeoutId = setTimeout(() => {
      // this._peer.disconnect(DISCONNECT_REASON.TIMEOUT);
    }, 5000) // 5 sec * 1000

    this._debug = devp2pDebug.extend(protocol as string)
    this._verbose = debugDefault('verbose').enabled
    this.initMsgDebuggers(protocol)

    // Register handlers after initialization
    this.registerHandlers()
  }

  private initMsgDebuggers(protocol: ProtocolType) {
    const MESSAGE_NAMES = Object.keys(this._messageCodes).filter(
      (key) => typeof key === 'string',
    ) as string[]
    for (const name of MESSAGE_NAMES) {
      this.msgDebuggers[name] = devp2pDebug.extend(protocol).extend(name)
    }

    // Remote Peer IP logger

    const ip = this._peer['_socket'].remoteAddress
    if (typeof ip === 'string') {
      this.msgDebuggers[ip] = devp2pDebug.extend(ip)
    }
  }

  /**
   * Called once on the peer where a first successful `STATUS`
   * msg exchange could be achieved.
   *
   * Can be used together with the `devp2p:FIRST_PEER` debugger.
   */
  _addFirstPeerDebugger() {
    const ip = this._peer['_socket'].remoteAddress
    if (typeof ip === 'string') {
      this.msgDebuggers[ip] = devp2pDebug.extend('FIRST_PEER')
      this._peer._addFirstPeerDebugger?.()
      this._firstPeer = ip
    }
  }

  /**
   * Debug message both on the generic as well as the
   * per-message debug logger
   * @param messageName Capitalized message name (e.g. `GET_BLOCK_HEADERS`)
   * @param msg Message text to debug
   */
  protected debug(messageName: string, msg: string) {
    this._debug(msg)
    if (this.msgDebuggers[messageName] !== undefined) {
      this.msgDebuggers[messageName](msg)
    }

    const ip = this._peer['_socket'].remoteAddress
    if (typeof ip === 'string' && this.msgDebuggers[ip] !== undefined) {
      this.msgDebuggers[ip](msg)
    }
  }
  /**
   * Register message handlers for this protocol
   * Subclasses should implement this to register handlers for their message codes
   */
  protected abstract registerHandlers(): void

  /**
   * Handle incoming messages by routing to registered handlers
   * @param code Message code
   * @param data Raw message data (will be RLP decoded by subclasses if needed)
   */
  _handleMessage(code: number, data: Uint8Array): void {
    const handler = this._registry.get(code)
    if (handler) {
      // Handler receives decoded payload - subclasses should decode before calling
      const result = handler(code, data)
      if (result instanceof Promise) {
        result.catch((error: Error) => {
          // const clientError = this.?.trackError?.(err)
          this.debug(
            `HANDLER_ERROR`,
            `Error in handler for code ${code}: ${error.message}`,
          )
          // Note: ProtocolEvent doesn't have error, so we can't emit it
          // Subclasses can handle errors in their own way
        })
      }
    } else {
      // No handler registered - emit as generic message event for backward compatibility
      // Note: Subclasses should override _handleMessage to properly type the code
      // For now, we emit with the code as-is - subclasses will handle proper typing
      this.events.emit('message', code as never, data)
    }
  }

  /**
   * Send a protocol message
   * @param code Message code (relative to protocol offset)
   * @param payload Message payload (will be encoded by subclasses)
   */
  protected sendMessage(code: number, payload: Uint8Array): void {
    if (this._connection.sendSubprotocolMessage) {
      // Use connection's sendSubprotocolMessage if available
      this._connection.sendSubprotocolMessage(
        this._protocolOffset + code,
        payload,
      )
    } else {
      throw new Error(
        'Connection does not support sendSubprotocolMessage - cannot send message',
      )
    }
  }

  /**
   * Register a handler for a message code
   */
  protected registerHandler(
    code: number,
    handler: ProtocolMessageHandler,
  ): void {
    this._registry.register(code, handler)
  }
}
