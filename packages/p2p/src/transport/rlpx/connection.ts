/**
 * RLPx Connection - Wraps the ECIES-encrypted peer session
 *
 * This adapts the Peer class logic from devp2p/rlpx/peer.ts to a
 * connection-like interface compatible with libp2p patterns.
 */

import type { Logger } from '@libp2p/interface'
import debug from 'debug'
import { EventEmitter } from 'eventemitter3'
import type { Socket } from 'net'
import * as snappy from 'snappyjs'
import type { Capabilities } from '../../../client/net/dpt-1/types'
import {
	DISCONNECT_REASON,
	DisconnectReasonNames,
} from '../../../client/net/dpt-1/types'
// import type { ProtocolStream } from "../../../client/net/protocol/protocol-stream.ts";
// import { RLPxProtocolStream } from "../../../client/net/protocol/protocol-stream.ts";
import type { Protocol } from '../../../client/net/protocol/protocol'
import { RLP } from '@ts-ethereum/rlp'
import {
	bytesToInt,
	bytesToUtf8,
	concatBytes,
	equalsBytes,
	hexToBytes,
	intToBytes,
	utf8ToBytes,
} from '@ts-ethereum/utils'
import { ECIES } from '../../connection-encrypters/eccies/ecies'
import type {
	HelloMessage,
	ProtocolDescriptor,
	RLPxConnectionEvents,
	RLPxConnectionOptions,
	RLPxConnectionState,
	RLPxPrefix,
} from './types'
import {
	BASE_PROTOCOL_LENGTH,
	BASE_PROTOCOL_VERSION,
	PING_INTERVAL,
	RLPX_PREFIXES,
} from './types'

const log = debug('p2p:rlpx:connection')
type HelloMsg = {
  0: Uint8Array
  1: Uint8Array
  2: Uint8Array[][]
  3: Uint8Array
  4: Uint8Array
  length: 5
}

/**
 * RLPx Connection - Manages ECIES encryption and Hello handshake
 */
export class RLPxConnection extends EventEmitter<RLPxConnectionEvents> {
  // Connection identity
  public readonly nodeId: Uint8Array
  public readonly clientId: Uint8Array
  public readonly direction: 'inbound' | 'outbound'

  // Configuration - exposed for subprotocol access (ETH protocol needs common)
  private readonly _capabilities: Capabilities[]
  public readonly common: RLPxConnectionOptions['common']
  private readonly _listenPort: number
  private readonly _remoteClientIdFilter?: string[]
  private readonly _timeout: number
  private readonly _useEIP8: boolean

  // Socket - exposed for subprotocol access (ETH protocol needs _socket)
  public readonly _socket: Socket
  private _socketData: Uint8Array

  // ECIES session
  private readonly _eciesSession: ECIES
  private _remoteId: Uint8Array | null

  // State machine
  private _state: RLPxConnectionState
  private _nextPacketSize: number

  // Hello exchange - _hello exposed for subprotocol access (ETH protocol needs it)
  private _weHello: HelloMsg | null
  public _hello: HelloMessage | null

  // Connection state
  private _connected: boolean
  private _closed: boolean
  private _disconnectReason?: number
  private _disconnectWe: boolean | null

  // Ping/Pong
  private _pingIntervalId: NodeJS.Timeout | null
  private _pingTimeoutId: NodeJS.Timeout | null

  // Subprotocols
  private _protocols: ProtocolDescriptor[]

  // Logger
  private readonly log: Logger

  constructor(options: RLPxConnectionOptions) {
    super()

    this.nodeId = options.nodeId
    this.clientId = options.clientId
    this.direction = options.direction

    this._capabilities = options.capabilities
    this.common = options.common
    this._listenPort = options.listenPort
    this._remoteClientIdFilter = options.remoteClientIdFilter
    this._timeout = options.timeout
    this._useEIP8 = options.useEIP8 ?? true

    this._socket = options.socket
    this._socketData = new Uint8Array()

    this._remoteId = options.remoteId

    // Initialize ECIES session
    this._eciesSession = new ECIES(
      options.privateKey,
      this.nodeId,
      this._remoteId!,
      this.common,
    )

    // Initial state depends on direction
    if (this.direction === 'outbound') {
      this._state = 'Auth'
      this._nextPacketSize = 307
    } else {
      // Inbound: wait for auth
      this._state = 'Auth'
      this._nextPacketSize = 307
    }

    this._weHello = null
    this._hello = null
    this._connected = false
    this._closed = false
    this._disconnectWe = null
    this._pingIntervalId = null
    this._pingTimeoutId = null
    this._protocols = []

    this.log = log

    // Setup socket handlers
    this._setupSocketHandlers()

    // If outbound, initiate auth
    if (this.direction === 'outbound' && this._remoteId !== null) {
      this._sendAuth()
    }
  }

  /**
   * Setup socket event handlers
   */
  private _setupSocketHandlers(): void {
    this._socket.on('data', this._onSocketData.bind(this))
    this._socket.on('error', (err: Error) => {
      console.log(err)
      this.emit('error', err)
    })
    this._socket.once('close', this._onSocketClose.bind(this))

    // Set socket timeout
    this._socket.setTimeout(0)
  }

  /**
   * Send AUTH message (initiator only)
   */
  private _sendAuth(): void {
    if (this._closed) return

    this.log(
      'sending auth (EIP8: %s) to %s:%d',
      this._useEIP8,
      this._socket.remoteAddress,
      this._socket.remotePort,
    )

    if (this._useEIP8) {
      const authEIP8 = this._eciesSession.createAuthEIP8()
      if (!authEIP8) return
      this._socket.write(authEIP8)
    } else {
      const authNonEIP8 = this._eciesSession.createAuthNonEIP8()
      if (!authNonEIP8) return
      this._socket.write(authNonEIP8)
    }

    this._state = 'Ack'
    this._nextPacketSize = 210
  }

  /**
   * Send ACK message (responder only)
   */
  private _sendAck(): void {
    if (this._closed) return

    const gotEIP8Auth = (this._eciesSession as any)['_gotEIP8Auth']

    this.log(
      'sending ack (EIP8: %s) to %s:%d',
      gotEIP8Auth,
      this._socket.remoteAddress,
      this._socket.remotePort,
    )

    if (gotEIP8Auth) {
      const ackEIP8 = this._eciesSession.createAckEIP8()
      if (!ackEIP8) return
      this._socket.write(ackEIP8)
    } else {
      const ackOld = this._eciesSession.createAckOld()
      if (!ackOld) return
      this._socket.write(ackOld)
    }

    this._state = 'Header'
    this._nextPacketSize = 32
    this._sendHello()
  }

  /**
   * Send a message with header and body
   */
  private _sendMessage(code: number, data: Uint8Array): boolean {
    if (this._closed) return false

    const msg = concatBytes(RLP.encode(code), data)
    const header = this._eciesSession.createBlockHeader(msg.length)
    if (!header || this._socket.destroyed) return false
    this._socket.write(header)

    const body = this._eciesSession.createBody(msg)
    if (!body || this._socket.destroyed) return false
    this._socket.write(body)

    return true
  }

  /**
   * Send HELLO message
   */
  private _sendHello(): void {
    const capsStr = this._capabilities
      .map((c) => `${c.name}${c.version}`)
      .join(',')
    this.log(
      'sending HELLO to %s:%d protocolVersion=%d capabilities=%s clientId=%s',
      this._socket.remoteAddress,
      this._socket.remotePort,
      BASE_PROTOCOL_VERSION,
      capsStr,
      bytesToUtf8(this.clientId),
    )

    const payload: HelloMsg = [
      intToBytes(BASE_PROTOCOL_VERSION),
      this.clientId,
      this._capabilities.map((c) => [
        utf8ToBytes(c.name),
        intToBytes(c.version),
      ]),
      this._listenPort === null
        ? new Uint8Array(0)
        : intToBytes(this._listenPort),
      this.nodeId,
    ]

    if (!this._closed) {
      if (
        this._sendMessage(
          RLPX_PREFIXES.HELLO,
          RLP.encode(payload as never as Uint8Array[]),
        )
      ) {
        this._weHello = payload
      }
      if (this._hello) {
        this._onConnect()
      }
    }
  }

  /**
   * Send DISCONNECT message
   */
  private _sendDisconnect(reason: number): void {
    const reasonName =
      DisconnectReasonNames[reason as DISCONNECT_REASON] ?? 'UNKNOWN'
    this.log(
      'sending DISCONNECT to %s:%d reason=%s',
      this._socket.remoteAddress,
      this._socket.remotePort,
      reasonName,
    )

    const data = RLP.encode(reason)
    if (this._sendMessage(RLPX_PREFIXES.DISCONNECT, data) !== true) return

    this._disconnectReason = reason
    this._disconnectWe = true
    this._closed = true
    setTimeout(() => this._socket.end(), 2000)
  }

  /**
   * Send PING message
   */
  private _sendPing(): void {
    this.log(
      'sending PING to %s:%d',
      this._socket.remoteAddress,
      this._socket.remotePort,
    )

    let data = RLP.encode([])
    if (this._hello !== null && this._hello.protocolVersion >= 5) {
      data = snappy.compress(data)
    }

    if (this._sendMessage(RLPX_PREFIXES.PING, data) !== true) return

    clearTimeout(this._pingTimeoutId!)
    this._pingTimeoutId = setTimeout(() => {
      this.disconnect(DISCONNECT_REASON.TIMEOUT)
    }, this._timeout)
  }

  /**
   * Send PONG message
   */
  private _sendPong(): void {
    this.log(
      'sending PONG to %s:%d',
      this._socket.remoteAddress,
      this._socket.remotePort,
    )

    let data = RLP.encode([])
    if (this._hello !== null && this._hello.protocolVersion >= 5) {
      data = snappy.compress(data)
    }

    this._sendMessage(RLPX_PREFIXES.PONG, data)
  }

  /**
   * Handle AUTH message (responder)
   */
  private _handleAuth(): void {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    const gotEIP8Auth = (this._eciesSession as any)['_gotEIP8Auth']

    if (!gotEIP8Auth) {
      if (parseData.subarray(0, 1) === hexToBytes('0x04')) {
        this._eciesSession.parseAuthPlain(parseData)
      } else {
        ;(this._eciesSession as any)['_gotEIP8Auth'] = true
        this._nextPacketSize = bytesToInt(this._socketData.subarray(0, 2)) + 2
        return
      }
    } else {
      this._eciesSession.parseAuthEIP8(parseData)
    }

    this._state = 'Header'
    this._nextPacketSize = 32
    process.nextTick(() => this._sendAck())
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Handle ACK message (initiator)
   */
  private _handleAck(): void {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    const gotEIP8Ack = (this._eciesSession as any)['_gotEIP8Ack']

    if (!gotEIP8Ack) {
      if (parseData.subarray(0, 1) === hexToBytes('0x04')) {
        this._eciesSession.parseAckPlain(parseData)
        this.log(
          'received ack (old format) from %s:%d',
          this._socket.remoteAddress,
          this._socket.remotePort,
        )
      } else {
        ;(this._eciesSession as any)['_gotEIP8Ack'] = true
        this._nextPacketSize = bytesToInt(this._socketData.subarray(0, 2)) + 2
        return
      }
    } else {
      this._eciesSession.parseAckEIP8(parseData)
      this.log(
        'received ack (EIP8) from %s:%d',
        this._socket.remoteAddress,
        this._socket.remotePort,
      )
    }

    this._state = 'Header'
    this._nextPacketSize = 32
    process.nextTick(() => this._sendHello())
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Handle HELLO message
   */
  private _handleHello(payload: any): void {
    this._hello = {
      protocolVersion: bytesToInt(payload[0]),
      clientId: bytesToUtf8(payload[1]),
      capabilities: payload[2].map((item: any) => ({
        name: bytesToUtf8(item[0]),
        version: bytesToInt(item[1]),
      })),
      port: bytesToInt(payload[3]),
      id: payload[4],
    }

    this.log(
      'received HELLO from %s:%d protocolVersion=%d capabilities=%s clientId=%s',
      this._socket.remoteAddress,
      this._socket.remotePort,
      this._hello.protocolVersion,
      this._hello.capabilities.map((c) => `${c.name}${c.version}`).join(','),
      this._hello.clientId,
    )

    // Validate remote ID
    if (this._remoteId === null) {
      this._remoteId = this._hello.id
    } else if (!equalsBytes(this._remoteId, this._hello.id)) {
      this.disconnect(DISCONNECT_REASON.INVALID_IDENTITY)
      return
    }

    // Check client ID filter
    if (this._remoteClientIdFilter !== undefined) {
      for (const filterStr of this._remoteClientIdFilter) {
        if (
          this._hello.clientId.toLowerCase().includes(filterStr.toLowerCase())
        ) {
          this.disconnect(DISCONNECT_REASON.USELESS_PEER)
          return
        }
      }
    }

    // Negotiate shared capabilities
    const shared: { [name: string]: Capabilities } = {}
    for (const item of this._hello.capabilities) {
      for (const c of this._capabilities) {
        if (c.name !== item.name || c.version !== item.version) continue
        if (shared[c.name] !== undefined && shared[c.name].version > c.version)
          continue
        shared[c.name] = c
      }
    }

    // Setup protocol offsets
    let offset = BASE_PROTOCOL_LENGTH
    this._protocols = Object.keys(shared)
      .map((key) => shared[key])
      .sort((obj1, obj2) => (obj1.name < obj2.name ? -1 : 1))
      .map((obj) => {
        const _offset = offset
        offset += obj.length

        const SubProtocol = obj.constructor
        // Pass connection (this) and protocol offset instead of sendMethod callback
        const protocol = new SubProtocol(obj.version, this, _offset)

        return { protocol, offset: _offset, length: obj.length }
      })

    if (this._protocols.length === 0) {
      this.disconnect(DISCONNECT_REASON.USELESS_PEER)
      return
    }

    this._connected = true

    this._pingIntervalId = setInterval(() => this._sendPing(), PING_INTERVAL)

    if (this._weHello) {
      this._onConnect()
    }
  }

  /**
   * Handle DISCONNECT message
   */
  private _handleDisconnect(payload: any): void {
    this._closed = true
    this._disconnectReason =
      payload instanceof Uint8Array
        ? bytesToInt(payload)
        : bytesToInt(payload[0] ?? Uint8Array.from([0]))

    const reasonName =
      DisconnectReasonNames[this._disconnectReason as DISCONNECT_REASON] ??
      'UNKNOWN'
    this.log(
      'received DISCONNECT from %s:%d reason=%s',
      this._socket.remoteAddress,
      this._socket.remotePort,
      reasonName,
    )

    this._disconnectWe = false
    this._socket.end()
  }

  /**
   * Handle PING message
   */
  private _handlePing(): void {
    this._sendPong()
  }

  /**
   * Handle PONG message
   */
  private _handlePong(): void {
    clearTimeout(this._pingTimeoutId!)
  }

  /**
   * Handle base protocol message
   */
  private _handleMessage(code: RLPxPrefix, msg: Uint8Array): void {
    switch (code) {
      case RLPX_PREFIXES.HELLO:
        this._handleHello(msg)
        break
      case RLPX_PREFIXES.DISCONNECT:
        this._handleDisconnect(msg)
        break
      case RLPX_PREFIXES.PING:
        this._handlePing()
        break
      case RLPX_PREFIXES.PONG:
        this._handlePong()
        break
    }
  }

  /**
   * Handle message header
   */
  private _handleHeader(): void {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)

    this.log(
      'received header from %s:%d',
      this._socket.remoteAddress,
      this._socket.remotePort,
    )

    const size = this._eciesSession.parseHeader(parseData)
    if (size === undefined) {
      this.log('invalid header size!')
      return
    }

    this._state = 'Body'
    this._nextPacketSize = size + 16
    if (size % 16 > 0) this._nextPacketSize += 16 - (size % 16)
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Handle message body
   */
  private _handleBody(): void {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    const body = this._eciesSession.parseBody(parseData)

    if (!body) {
      this.log('empty body!')
      return
    }

    this.log(
      'received body from %s:%d (%d bytes)',
      this._socket.remoteAddress,
      this._socket.remotePort,
      body.length,
    )

    this._state = 'Header'
    this._nextPacketSize = 32

    // RLP hack for code
    let code = body[0]
    if (code === 0x80) code = 0

    // Reject non-Hello/Disconnect before Hello
    if (
      code !== RLPX_PREFIXES.HELLO &&
      code !== RLPX_PREFIXES.DISCONNECT &&
      this._hello === null
    ) {
      this.disconnect(DISCONNECT_REASON.PROTOCOL_ERROR)
      return
    }

    // Get protocol handler
    const protocolObj = this._getProtocol(code)
    if (protocolObj === undefined) {
      this.disconnect(DISCONNECT_REASON.PROTOCOL_ERROR)
      return
    }

    const msgCode = code - protocolObj.offset
    const protocolName = protocolObj.protocol.constructor.name

    try {
      let payload: any = body.subarray(1)

      // Snappy decompression for protocol version >= 5
      let compressed = false
      const origPayload = payload
      if (this._hello !== null && this._hello.protocolVersion >= 5) {
        payload = snappy.uncompress(payload)
        compressed = true
      }

      // Handle base protocol vs subprotocol
      if (protocolName === 'RLPxConnection') {
        try {
          payload = RLP.decode(payload)
        } catch (e: any) {
          if (msgCode === RLPX_PREFIXES.DISCONNECT) {
            if (compressed) {
              payload = RLP.decode(origPayload)
            } else {
              payload = RLP.decode(snappy.uncompress(payload))
            }
          } else {
            throw new Error(e)
          }
        }
        this._handleMessage(msgCode as RLPxPrefix, payload)
      } else {
        // Subprotocol message
        protocolObj.protocol._handleMessage?.(msgCode, payload)
      }
    } catch (err: any) {
      console.log(err)
      this.disconnect(DISCONNECT_REASON.SUBPROTOCOL_ERROR)
      this.log('error handling message: %s', err.message)
      this.emit('error', err)
    }

    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Process incoming socket data
   */
  private _onSocketData(data: Uint8Array): void {
    if (this._closed) return

    // Refresh socket timeout when data is received to prevent premature disconnection
    // Node.js sockets should auto-refresh, but we explicitly refresh to be safe
    // This ensures the timeout doesn't fire between PING messages (15s interval)
    this._socket.setTimeout(this._timeout)

    this._socketData = concatBytes(this._socketData, data)

    try {
      while (this._socketData.length >= this._nextPacketSize) {
        switch (this._state) {
          case 'Auth':
            this._handleAuth()
            break
          case 'Ack':
            this._handleAck()
            break
          case 'Header':
            this._handleHeader()
            break
          case 'Body':
            this._handleBody()
            break
        }
      }
    } catch (err: any) {
      console.log(err)
      this.disconnect(DISCONNECT_REASON.SUBPROTOCOL_ERROR)
      this.log('error processing socket data: %s', err.message)
      this.emit('error', err)
    }
  }

  /**
   * Handle socket close
   */
  private _onSocketClose(): void {
    clearInterval(this._pingIntervalId!)
    clearTimeout(this._pingTimeoutId!)

    this._closed = true
    if (this._connected) {
      this.emit('close', this._disconnectReason, this._disconnectWe)
    }
  }

  /**
   * Emit connect event and protocols:ready event
   */
  private _onConnect(): void {
    this.emit('connect')
    // Emit protocols:ready event so listeners can send STATUS if needed
    const protocols = this._protocols.map((obj) => obj.protocol)
    this.log(
      'Emitting protocols:ready event with %d protocols',
      protocols.length,
    )
    this.emit('protocols:ready', protocols)
  }

  /**
   * Get protocol handler for message code
   */
  private _getProtocol(code: number): ProtocolDescriptor | undefined {
    if (code < BASE_PROTOCOL_LENGTH) {
      return { protocol: this as unknown as Protocol, offset: 0 }
    }
    for (const obj of this._protocols) {
      if (code >= obj.offset && code < obj.offset + obj.length!) return obj
    }
  }

  // Public API

  /**
   * Get remote peer ID
   */
  getId(): Uint8Array | null {
    return this._remoteId
  }

  /**
   * Get remote Hello message
   */
  getHelloMessage(): HelloMessage | null {
    return this._hello
  }

  /**
   * Get negotiated protocols
   */
  getProtocols(): Protocol[] {
    return this._protocols.map((obj) => obj.protocol)
  }

  /**
   * Get the underlying socket
   */
  getSocket(): Socket {
    return this._socket
  }

  /**
   * Check if connection is open
   */
  isConnected(): boolean {
    return this._connected && !this._closed
  }

  /**
   * Get remote address
   */
  get remoteAddress(): string | undefined {
    return this._socket.remoteAddress
  }

  /**
   * Get remote port
   */
  get remotePort(): number | undefined {
    return this._socket.remotePort
  }

  /**
   * Disconnect from peer
   */
  disconnect(reason: number = DISCONNECT_REASON.DISCONNECT_REQUESTED): void {
    this._sendDisconnect(reason)
  }

  /**
   * Get human-readable disconnect reason name
   * Compatible with Devp2pRlpxPeer.getDisconnectPrefix()
   */
  getDisconnectPrefix(reason: number): string {
    return DisconnectReasonNames[reason as DISCONNECT_REASON] ?? 'UNKNOWN'
  }

  /**
   * Send a subprotocol message
   */
  sendSubprotocolMessage(code: number, data: Uint8Array): boolean {
    return this._sendMessage(code, data)
  }

  /**
   * Get a protocol stream for a specific protocol
   * Similar to libp2p's dialProtocol, but works with already-established RLPx connection
   *
   * @param protocolName Protocol name (e.g., "eth")
   * @param version Protocol version (e.g., 68)
   * @returns ProtocolStream if protocol is negotiated, null otherwise
   *
   * @example
   * ```typescript
   * const stream = connection.getProtocolStream("eth", 68);
   * if (stream) {
   *   stream.onMessage((code, payload) => {
   *     console.log("Received:", code, payload);
   *   });
   *   stream.send(0x03, encodedGetBlockHeaders);
   * }
   * ```
   */
  // getProtocolStream(
  // 	protocolName: string,
  // 	version: number,
  // ): ProtocolStream | null {
  // 	if (!this._connected || this._closed) {
  // 		return null;
  // 	}

  // 	// Find the protocol in negotiated protocols
  // 	const protocolDescriptor = this._protocols.find((desc) => {
  // 		const proto = desc.protocol;
  // 		// Get protocol name from constructor (e.g., "ETH" -> "eth")
  // 		const name = proto.constructor.name.toLowerCase();

  // 		// Check if this matches the requested protocol
  // 		if (name !== protocolName.toLowerCase()) {
  // 			return false;
  // 		}

  // 		// Check version if protocol has a version property
  // 		if ((proto as any)._version !== undefined) {
  // 			return (proto as any)._version === version;
  // 		}

  // 		// If no version property, accept any version match
  // 		return true;
  // 	});

  // 	if (!protocolDescriptor) {
  // 		return null;
  // 	}

  // 	// Create and return protocol stream
  // 	return new RLPxProtocolStream(
  // 		protocolName,
  // 		version,
  // 		this,
  // 		protocolDescriptor,
  // 	);
  // }

  /**
   * Add first peer debugger - called by subprotocols on first STATUS exchange
   * This enables per-peer debugging for the first connected peer
   */
  _addFirstPeerDebugger(): void {
    // For the libp2p-style connection, we already have logging via the Logger interface
    // This method exists for compatibility with the ETH protocol
    const ip = this._socket.remoteAddress
    if (typeof ip === 'string') {
      this.log('First peer debugger added for %s', ip)
    }
  }

  /**
   * Close connection immediately
   */
  close(): void {
    if (this._closed) return
    this._closed = true

    clearInterval(this._pingIntervalId!)
    clearTimeout(this._pingTimeoutId!)

    this._socket.destroy()
    this.emit('close', undefined, true)
  }
}
