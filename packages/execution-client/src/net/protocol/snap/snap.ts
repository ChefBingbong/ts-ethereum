import type { Input } from '@ts-ethereum/rlp'
import { RLP } from '@ts-ethereum/rlp'
import { bytesToHex, formatLogData } from '@ts-ethereum/utils'
import * as snappy from 'snappyjs'
import { ProtocolType } from '../../dpt-1/types'
import type { ProtocolConnection } from '../protocol'
import { Protocol } from '../protocol'

/**
 * SNAP protocol message codes (snap/1)
 * https://github.com/ethereum/devp2p/blob/master/caps/snap.md
 */
export const SnapMessageCodes = {
  GET_ACCOUNT_RANGE: 0x00,
  ACCOUNT_RANGE: 0x01,
  GET_STORAGE_RANGES: 0x02,
  STORAGE_RANGES: 0x03,
  GET_BYTE_CODES: 0x04,
  BYTE_CODES: 0x05,
  GET_TRIE_NODES: 0x06,
  TRIE_NODES: 0x07,
} as const

export type SnapMessageCodes =
  (typeof SnapMessageCodes)[keyof typeof SnapMessageCodes]

// Create a reverse mapping: from numeric value back to the key name
export const SnapMessageCodeNames: { [key in SnapMessageCodes]: string } =
  Object.entries(SnapMessageCodes).reduce(
    (acc, [key, value]) => {
      acc[value as SnapMessageCodes] = key
      return acc
    },
    {} as { [key in SnapMessageCodes]: string },
  )

/**
 * SNAP Protocol implementation (snap/1)
 *
 * Implements the Ethereum SNAP protocol for state synchronization.
 * Unlike ETH protocol, SNAP has no STATUS handshake - it's a pure request/response protocol.
 */
export class SNAP extends Protocol {
  private DEBUG = false

  constructor(
    version: number,
    connection: ProtocolConnection,
    protocolOffset?: number,
  ) {
    super(
      connection,
      ProtocolType.SNAP,
      version,
      SnapMessageCodes,
      protocolOffset,
    )

    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    this.DEBUG = process?.env?.DEBUG?.includes('ethjs') ?? false
  }

  // snap/1 capability definition
  static snap1 = { name: 'snap', version: 1, length: 8, constructor: SNAP }

  /**
   * Register message handlers for SNAP protocol
   * By default, messages are emitted as events for backward compatibility
   * Handlers can be registered externally via registerHandler()
   */
  protected registerHandlers(): void {
    // SNAP has no special messages like STATUS
    // All messages are emitted as events by default
    // External code (like SnapHandler) can register handlers via registerHandler()
  }

  /**
   * Handle incoming SNAP protocol messages
   * Decodes RLP and routes to handlers or emits events
   */
  _handleMessage(code: number, data: Uint8Array): void {
    const snapCode = code as SnapMessageCodes
    const payload = RLP.decode(data)

    if (this.DEBUG) {
      const debugMsg = `Received ${this.getMsgPrefix(snapCode)} message from ${
        this._connection._socket.remoteAddress
      }:${this._connection._socket.remotePort}`
      const logData = formatLogData(bytesToHex(data), this._verbose)
      this.debug(this.getMsgPrefix(snapCode), `${debugMsg}: ${logData}`)
    }

    // Check if handler is registered, otherwise emit event for backward compatibility
    if (this._registry.has(snapCode)) {
      // Route to registered handler
      super._handleMessage(snapCode, payload as Uint8Array)
    } else {
      // Emit as event for backward compatibility
      this.events.emit('message', snapCode as never, payload)
    }
  }

  /**
   * Send a SNAP protocol message
   */
  sendMessage(code: SnapMessageCodes, payload: Input): void {
    if (this.DEBUG) {
      const logData = formatLogData(
        bytesToHex(RLP.encode(payload)),
        this._verbose,
      )
      const messageName = this.getMsgPrefix(code)
      const debugMsg = `Send ${messageName} message to ${this._connection._socket.remoteAddress}:${this._connection._socket.remotePort}: ${logData}`

      this.debug(messageName, debugMsg)
    }

    let encodedPayload = RLP.encode(payload)

    // Use snappy compression if peer supports DevP2P >=v5
    if (
      this._connection._hello !== null &&
      this._connection._hello.protocolVersion >= 5
    ) {
      encodedPayload = snappy.compress(encodedPayload)
    }

    // Use base class sendMessage which calls connection.sendSubprotocolMessage
    super.sendMessage(code, encodedPayload)
  }

  getMsgPrefix(msgCode: SnapMessageCodes): string {
    return SnapMessageCodeNames[msgCode] ?? `UNKNOWN(${msgCode})`
  }

  getVersion() {
    return this._version
  }
}
