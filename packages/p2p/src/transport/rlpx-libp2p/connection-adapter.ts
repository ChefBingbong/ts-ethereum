/**
 * Connection Adapter - Wraps RLPxConnection to implement libp2p Connection interface
 *
 * This adapter bridges the gap between RLPX's connection model and libp2p's Connection interface,
 * allowing RLPX connections to work with libp2p's connection management.
 */

import { privateKeyFromRaw } from '@libp2p/crypto/keys'
import type {
    Connection,
    ConnectionStatus,
    Logger,
    PeerId,
    Stream,
} from '@libp2p/interface'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import type { Multiaddr } from '@multiformats/multiaddr'
import { multiaddr } from '@multiformats/multiaddr'
import { randomBytes } from 'node:crypto'
import { RLPxConnection } from './connection'
import type { HelloMessage } from './types'

/**
 * Connection Adapter - Wraps RLPxConnection to implement libp2p Connection interface
 */
export class RLPxConnectionAdapter implements Connection {
  public readonly id: string
  public readonly remoteAddr: Multiaddr
  public readonly remotePeer: PeerId
  public readonly stat: {
    direction: 'inbound' | 'outbound'
    status: ConnectionStatus
    timeline: {
      open: number
      close?: number
    }
  }
  public readonly streams: Stream[]
  public readonly direction: 'inbound' | 'outbound'
  public get status(): ConnectionStatus {
    return this.stat.status
  }
  public get timeline(): {
    open: number
    close?: number
  } {
    return this.stat.timeline
  }
  public readonly direct = true // RLPX connections are direct (not relayed)
  public readonly log: Logger

  // EventTarget methods required by Connection interface
  public readonly addEventListener: EventTarget['addEventListener']
  public readonly removeEventListener: EventTarget['removeEventListener']
  public readonly dispatchEvent: EventTarget['dispatchEvent']
  public readonly listenerCount: (type: string) => number
  public readonly safeDispatchEvent: <Detail>(
    type: 'close' | 'remoteCloseWrite' | 'idle',
    detail?: CustomEventInit<Detail>,
  ) => boolean

  private readonly _rlpxConnection: RLPxConnection
  private readonly _eventTarget: EventTarget
  private _closed = false
  private _statStatus: ConnectionStatus

  constructor(rlpxConnection: RLPxConnection, logger: Logger) {
    this._eventTarget = new EventTarget()

    // Bind EventTarget methods
    this.addEventListener = this._eventTarget.addEventListener.bind(
      this._eventTarget,
    )
    this.removeEventListener = this._eventTarget.removeEventListener.bind(
      this._eventTarget,
    )
    this.dispatchEvent = this._eventTarget.dispatchEvent.bind(this._eventTarget)
    this.listenerCount = (_type: string) => {
      // Simple implementation - in practice this would count actual listeners
      return 0
    }
    this.safeDispatchEvent = <Detail>(
      type: 'close' | 'remoteCloseWrite' | 'idle',
      detail?: CustomEventInit<Detail>,
    ): boolean => {
      const event = new CustomEvent(type, detail)
      return this._eventTarget.dispatchEvent(event)
    }
    this.log = logger
    this._rlpxConnection = rlpxConnection
    this.id = `rlpx-${Buffer.from(randomBytes(8)).toString('hex')}-${Date.now()}`

    // Convert RLPX node ID to PeerId
    // For outbound connections, remoteId is set from options.remoteId
    // For inbound connections, remoteId is set after Hello exchange completes
    // The adapter is created after _waitForConnect completes, so remoteId should be available
    const remoteId = rlpxConnection.getId()
    if (!remoteId) {
      // This should not happen if adapter is created after Hello exchange
      // But handle it gracefully for safety
      this.log.error(
        'RLPx connection remote ID not available - connection may not be fully established',
      )
      // Try to get it from Hello message if available
      const hello = rlpxConnection.getHelloMessage()
      if (hello?.id) {
        this.remotePeer = peerIdFromPrivateKey(
          privateKeyFromRaw(new Uint8Array(hello.id)),
        )
      } else {
        throw new Error(
          'RLPx connection must have remote ID to create adapter. Connection may not be fully established.',
        )
      }
    } else {
      this.remotePeer = peerIdFromPrivateKey(privateKeyFromRaw(remoteId))
    }

    // Create Multiaddr from socket address
    const remoteAddress = rlpxConnection.remoteAddress
    const remotePort = rlpxConnection.remotePort
    if (remoteAddress && remotePort) {
      // Determine IP version
      const isIPv6 = remoteAddress.includes(':')
      if (isIPv6) {
        this.remoteAddr = multiaddr(`/ip6/${remoteAddress}/tcp/${remotePort}`)
      } else {
        this.remoteAddr = multiaddr(`/ip4/${remoteAddress}/tcp/${remotePort}`)
      }
    } else {
      // Fallback to a default address if socket info not available
      this.remoteAddr = multiaddr('/ip4/0.0.0.0/tcp/0')
    }

    // Set direction
    this.direction =
      rlpxConnection.direction === 'outbound' ? 'outbound' : 'inbound'

    // Connection stat and status (use lowercase for ConnectionStatus)
    this._statStatus = rlpxConnection.isConnected() ? 'open' : 'closing'

    this.stat = {
      direction: this.direction,
      status: this._statStatus,
      timeline: {
        open: Date.now(),
      },
    }

    // RLPX doesn't use libp2p streams, so we return empty array
    this.streams = []

    // Listen for RLPX connection events and update stat
    rlpxConnection.once('connect', () => {
      this._statStatus = 'open'
      this.stat.status = 'open'
    })

    rlpxConnection.once('close', () => {
      this._closed = true
      this._statStatus = 'closed'
      this.stat.status = 'closed'
      this.stat.timeline.close = Date.now()
    })

    rlpxConnection.on('error', () => {
      this._statStatus = 'closing'
      this.stat.status = 'closing'
    })
  }

  /**
   * Get the underlying RLPx connection
   */
  get rlpxConnection(): RLPxConnection {
    return this._rlpxConnection
  }

  /**
   * Get RLPX-specific Hello message
   */
  getHelloMessage(): HelloMessage | null {
    return this._rlpxConnection.getHelloMessage()
  }

  /**
   * Get RLPX-specific protocols
   */
  getProtocols(): any[] {
    return this._rlpxConnection.getProtocols()
  }

  /**
   * Create a new stream (not supported by RLPX)
   */
  async newStream(_protocols: string[]): Promise<Stream> {
    // RLPX doesn't use libp2p streams - it has its own protocol negotiation
    // This is a limitation, but we throw an error to indicate it's not supported
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throw new Error(
      'RLPX transport does not support libp2p streams - use RLPX protocol methods instead',
    ) as any
  }

  /**
   * Add a stream (no-op for RLPX)
   */
  addStream(_stream: Stream): void {
    // RLPX doesn't use libp2p streams
    // This is a no-op but we don't throw to allow libp2p to manage streams if needed
  }

  /**
   * Remove a stream (no-op for RLPX)
   */
  removeStream(_id: string): void {
    // RLPX doesn't use libp2p streams
    // This is a no-op
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this._closed) {
      return
    }

    this._closed = true
    this._statStatus = 'closing'
    this.stat.status = 'closing'
    this._rlpxConnection.close()
    this._statStatus = 'closed'
    this.stat.status = 'closed'
    this.stat.timeline.close = Date.now()
  }

  /**
   * Abort the connection immediately
   */
  abort(_err: Error): void {
    if (this._closed) {
      return
    }

    this._closed = true
    this._statStatus = 'closing'
    this.stat.status = 'closing'
    this._rlpxConnection.close()
    this._statStatus = 'closed'
    this.stat.status = 'closed'
    this.stat.timeline.close = Date.now()
  }
}
