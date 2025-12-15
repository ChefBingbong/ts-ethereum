import type { Multiaddr } from '@multiformats/multiaddr'
import { CODE_P2P } from '@multiformats/multiaddr'
import { setMaxListeners, TypedEventEmitter } from 'main-event'
import * as mss from '../multi-stream-select'
import { AbstractMessageStream, Logger } from '../stream/default-message-stream'
import { MessageStreamDirection, MessageStreamEvents, StreamCloseEvent } from '../stream/types'
import { AbstractMultiaddrConnection } from './abstract-multiaddr-connection'
import { DEFAULT_MAX_INBOUND_STREAMS, DEFAULT_MAX_OUTBOUND_STREAMS, Registrar } from './registrar'
import { AbortOptions, NewStreamOptions, PeerId } from './types'
import { CONNECTION_CLOSE_TIMEOUT, PROTOCOL_NEGOTIATION_TIMEOUT } from './upgrader'


export interface ConnectionComponents {
  registrar: Registrar
}

export interface ConnectionInit {
  id: string
  maConn: AbstractMultiaddrConnection
  stream: AbstractMessageStream
  remotePeer: PeerId
  direction?: MessageStreamDirection
  muxer?: any
  cryptoProtocol?: string
  outboundStreamProtocolNegotiationTimeout?: number
  inboundStreamProtocolNegotiationTimeout?: number
  closeTimeout?: number
}

/**
 * An implementation of the js-libp2p connection.
 * Any libp2p transport should use an upgrader to return this connection.
 */
export class Connection extends TypedEventEmitter<MessageStreamEvents> implements Connection {
  private static isDirect(remoteAddr: Multiaddr): boolean {
    return remoteAddr.getComponents().find(component => component.code === CODE_P2P) != null
  }
  public readonly id: string
  public readonly remoteAddr: Multiaddr
  public readonly remotePeer: PeerId
  public direction: MessageStreamDirection
  public timeline: any
  public direct: boolean
  public multiplexer?: string
  public encryption?: string
  public readonly log: Logger

  private readonly maConn: AbstractMultiaddrConnection
  private readonly muxer?: any
  private readonly components: ConnectionComponents
  private readonly outboundStreamProtocolNegotiationTimeout: number
  private readonly inboundStreamProtocolNegotiationTimeout: number
  private readonly closeTimeout: number

  
  constructor (components: ConnectionComponents, init: ConnectionInit) {
    super()

    this.components = components

    this.id = init.id
    this.remoteAddr = init.maConn.remoteAddr
    this.remotePeer = init.remotePeer
    this.direction = init.direction ?? 'outbound'
    this.encryption = init.cryptoProtocol
    this.maConn = init.maConn
    this.log = init.maConn.log
    this.outboundStreamProtocolNegotiationTimeout = init.outboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.inboundStreamProtocolNegotiationTimeout = init.inboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.closeTimeout = init.closeTimeout ?? CONNECTION_CLOSE_TIMEOUT
    this.direct = Connection.isDirect(init.maConn.remoteAddr)

    this.onIncomingStream = this.onIncomingStream.bind(this)

    if (this.remoteAddr.getComponents().find(component => component.code === CODE_P2P) == null) {
      this.remoteAddr = this.remoteAddr.encapsulate(`/p2p/${this.remotePeer}`)
    }

    if (init.muxer != null) {
      this.multiplexer = init.muxer.protocol
      this.muxer = init.muxer
      this.muxer.addEventListener('stream', this.onIncomingStream)
    }

    this.maConn.addEventListener('close', (evt) => {
      this.dispatchEvent(new StreamCloseEvent(evt.local, evt.error))
    })
  }
  get streams () {
    return this.muxer?.streams ?? []
  }

  async newStream (protocols: string | string[], options: AbortOptions = {}): Promise<AbstractMessageStream> {
    if (this.muxer == null) {
      throw new Error('Connection is not multiplexed')
    }

    if (this.muxer.status !== 'open') {
      throw new Error(`The connection muxer is "${this.muxer.status}" and not "open"`)
    }

    if (this.maConn.status !== 'open') {
      throw new Error(`The connection is "${this.maConn.status}" and not "open"`)
    }

    if (!Array.isArray(protocols)) {
      protocols = [protocols]
    }

    this.log('starting new stream for protocols %s', protocols)
    const muxedStream = await this.muxer.createStream({
      // most underlying transports only support negotiating a single protocol
      // so only pass the early protocol if a single protocol has been requested
      protocol: protocols.length === 1 ? protocols[0] : undefined
    })
    this.log('started new stream %s for protocols %s', muxedStream.id, protocols)

    try {
      if (options.signal == null) {
        muxedStream.log('no abort signal was passed while trying to negotiate protocols %s falling back to default timeout', protocols)

        const signal = AbortSignal.timeout(this.outboundStreamProtocolNegotiationTimeout)
        setMaxListeners(Infinity, signal)

        options = {
          ...options,
          signal
        }
      }

      if (muxedStream.protocol === '') {
        muxedStream.log.trace('selecting protocol from protocols %s', protocols)

        muxedStream.protocol = await mss.select(muxedStream, protocols, options)

        muxedStream.log('negotiated protocol %s', muxedStream.protocol)
      } else {
        muxedStream.log('pre-negotiated protocol %s', muxedStream.protocol)
      }

      const outgoingLimit = this.findOutgoingStreamLimit(muxedStream.protocol, options)
      const streamCount = this.countStreams(muxedStream.protocol, 'outbound')

      if (streamCount > outgoingLimit) {
        const err = new Error(`Too many outbound protocol streams for protocol "${muxedStream.protocol}" - ${streamCount}/${outgoingLimit}`)
        muxedStream.abort(err)
        throw err
      }

      return muxedStream
    } catch (err: any) {
      if (muxedStream.status === 'open') {
        muxedStream.abort(err)
      } else {
        this.log.error('could not create new outbound stream on connection %s %s for protocols %s - %s', this.direction === 'inbound' ? 'from' : 'to', this.remoteAddr.toString(), protocols, err.message)
      }

      throw err
    }
  }

  private async onIncomingStream (evt: CustomEvent<any>): Promise<void> {
    const muxedStream = evt.detail

    const signal = AbortSignal.timeout(this.inboundStreamProtocolNegotiationTimeout)
    setMaxListeners(Infinity, signal)

    muxedStream.log('start protocol negotiation, timing out after %dms', this.inboundStreamProtocolNegotiationTimeout)

    try {
      if (muxedStream.protocol === '') {
        const protocols = this.components.registrar.getProtocols()

        muxedStream.log.trace('selecting protocol from protocols %s', protocols)

        muxedStream.protocol = await mss.handle(muxedStream, protocols, {
          signal
        })

        muxedStream.log('negotiated protocol %s', muxedStream.protocol)
      } else {
        muxedStream.log('pre-negotiated protocol %s', muxedStream.protocol)
      }

      const incomingLimit = this.findIncomingStreamLimit(muxedStream.protocol)
      const streamCount = this.countStreams(muxedStream.protocol, 'inbound')

      if (streamCount > incomingLimit) {
        throw new Error(`Too many inbound protocol streams for protocol "${muxedStream.protocol}" - limit ${incomingLimit}`)
      }

      const { handler } = this.components.registrar.getHandler(muxedStream.protocol)

      // Call the protocol handler
      await handler(muxedStream)
    } catch (err: any) {
      muxedStream.abort(err)
    }
  }

  private findIncomingStreamLimit (protocol: string): number {
    try {
      const { options } = this.components.registrar.getHandler(protocol)

      if (options?.maxInboundStreams != null) {
        return options.maxInboundStreams
      }
    } catch {
      // Handler not found
    }

    return DEFAULT_MAX_INBOUND_STREAMS
  }

  private findOutgoingStreamLimit (protocol: string, options: NewStreamOptions = {}): number {
    try {
      const { options: handlerOptions } = this.components.registrar.getHandler(protocol)

      if (handlerOptions?.maxOutboundStreams != null) {
        return handlerOptions.maxOutboundStreams
      }
    } catch {
      // Handler not found
    }

    return options.maxOutboundStreams ?? DEFAULT_MAX_OUTBOUND_STREAMS
  }

  private countStreams (protocol: string, direction: 'inbound' | 'outbound'): number {
    let streamCount = 0

    this.streams.forEach(stream => {
      if (stream.direction === direction && stream.protocol === protocol) {
        streamCount++
      }
    })

    return streamCount
  }

  /**
   * Close the connection
   */
  async close (options: AbortOptions = {}): Promise<void> {
    this.log('closing connection to %s', this.remoteAddr.toString())

    if (options.signal == null) {
      const signal = AbortSignal.timeout(this.closeTimeout)
      setMaxListeners(Infinity, signal)

      options = {
        ...options,
        signal
      }
    }

    await this.muxer?.close(options)
    await this.maConn.close(options)
  }

  abort (err: Error): void {
    this.muxer?.abort(err)
    this.maConn.abort(err)
  }
}

export function createConnection (components: ConnectionComponents, init: ConnectionInit): Connection {
  return new Connection(components, init)
}

