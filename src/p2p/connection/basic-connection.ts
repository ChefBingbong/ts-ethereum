import type { Multiaddr } from '@multiformats/multiaddr'
import { TypedEventEmitter } from 'main-event'
import { bytesToUnprefixedHex } from '../../utils'
import { StreamMuxerFactory } from '../muxer'
import { AbstractMessageStream } from '../stream/default-message-stream'
import { MessageStreamDirection, MessageStreamEvents, StreamCloseEvent } from '../stream/types'
import { AbstractMultiaddrConnection } from './abstract-multiaddr-connection'
import { Connection, type ConnectionComponents } from './connection'
import { AbortOptions, PeerId } from './types'

interface BasicConnectionEvents extends MessageStreamEvents {
  upgraded: CustomEvent<Connection>
}

export interface BasicConnectionInit {
  id: string
  maConn: AbstractMultiaddrConnection
  stream: AbstractMessageStream
  remotePeer: PeerId
  direction?: MessageStreamDirection
  cryptoProtocol?: string
  closeTimeout?: number
}

const CONNECTION_CLOSE_TIMEOUT = 1_000

/**
 * BasicConnection - A connection without muxing, compatible with RLPx
 * Can be upgraded to a full Connection with muxing support
 */
export class BasicConnection extends TypedEventEmitter<BasicConnectionEvents> {
  public readonly id: string
  public readonly remoteAddr: Multiaddr
  public readonly remotePeer: PeerId
  public direction: MessageStreamDirection
  public encryption?: string
  public multiplexer?: string = undefined  // Explicitly no muxer

  protected readonly maConn: AbstractMultiaddrConnection
  protected readonly stream: AbstractMessageStream
  protected readonly closeTimeout: number

  constructor(init: BasicConnectionInit) {
    super()

    this.id = init.id
    this.remoteAddr = init.maConn.remoteAddr
    this.remotePeer = init.remotePeer
    this.direction = init.direction ?? 'outbound'
    this.encryption = init.cryptoProtocol
    this.maConn = init.maConn
    this.stream = init.stream
    this.closeTimeout = init.closeTimeout ?? CONNECTION_CLOSE_TIMEOUT

    this.maConn.addEventListener('close', (evt) => {
      this.dispatchEvent(new StreamCloseEvent(evt.local, evt.error))
    })
  }

  get status(): string {
    return this.maConn.status
  }

  get streams() {
    return []  // No streams - not multiplexed
  }

  get log() {
    return this.maConn.log
  }

  /**
   * Get the underlying stream for direct access (e.g., for RLPx)
   */
  get underlyingStream(): AbstractMessageStream {
    return this.stream
  }

  /**
   * Get the raw socket if available (for ECIES/RLPx)
   */
  get socket(): any {
    const maConnAny = this.maConn as any
    return maConnAny.socket || null
  }

  /**
   * Create a new stream - throws error as BasicConnection doesn't support muxing
   * Can be overridden by subclasses (e.g., Connection)
   */
  async newStream(_protocols: string | string[], _options?: any): Promise<any> {
    throw new Error('BasicConnection does not support streams. Use upgrade() to create a full Connection with muxing.')
  }

  /**
   * Upgrade this BasicConnection to a full Connection with muxing support
   */
  async upgrade(
    components: ConnectionComponents,
    streamMuxerFactory: StreamMuxerFactory,
    options: AbortOptions = {}
  ): Promise<Connection> {
    if (this.status !== 'open') {
      throw new Error(`Cannot upgrade connection with status "${this.status}"`)
    }

    this.log('upgrading BasicConnection to full Connection with muxing')

    // Negotiate muxer using multi-stream-select
    let muxerFactory: StreamMuxerFactory

    try {
      const mss = await import('../multi-stream-select')
      const protocols = [streamMuxerFactory.protocol]
      
      if (this.direction === 'inbound') {
        const protocol = await mss.handle(this.stream, protocols, options)
        if (protocol !== streamMuxerFactory.protocol) {
          throw new Error(`No muxer configured for protocol "${protocol}"`)
        }
        muxerFactory = streamMuxerFactory
      } else {
        const protocol = await mss.select(this.stream, protocols, options)
        if (protocol !== streamMuxerFactory.protocol) {
          throw new Error(`No muxer configured for protocol "${protocol}"`)
        }
        muxerFactory = streamMuxerFactory
      }

      const muxer = muxerFactory.createStreamMuxer(this.stream)
      this.log('muxer created: %s', muxerFactory.protocol)

      const { Connection: ConnectionClass } = await import('./connection')
      const fullConnection = new ConnectionClass(components, {
        id: this.id,
        maConn: this.maConn,
        stream: this.stream,
        remotePeer: this.remotePeer,
        direction: this.direction,
        muxer,
        cryptoProtocol: this.encryption,
        closeTimeout: this.closeTimeout,
      })

      // Emit upgrade event
      this.safeDispatchEvent('upgraded', {
        detail: fullConnection
      })

      return fullConnection
    } catch (err: any) {
      throw new Error(`Failed to upgrade connection: ${err.message}`)
    }
  }

  /**
   * Close the connection
   */
  async close(options: AbortOptions = {}): Promise<void> {
    this.log('closing BasicConnection to %s', this.remoteAddr.toString())

    if (options.signal == null) {
      const signal = AbortSignal.timeout(this.closeTimeout)
      options = { ...options, signal }
    }

    await this.maConn.close(options)
  }

  abort(err: Error): void {
    this.maConn.abort(err)
  }

  /**
   * Get remote peer ID as hex string
   */
  getRemotePeerIdString(): string {
    return bytesToUnprefixedHex(this.remotePeer)
  }
}

export function createBasicConnection(init: BasicConnectionInit): BasicConnection {
  return new BasicConnection(init)
}

