import type { Multiaddr } from '@multiformats/multiaddr'
import { CODE_P2P } from '@multiformats/multiaddr'
import { setMaxListeners } from 'main-event'
import * as mss from '../multi-stream-select'
import { MplexStreamMuxer } from '../muxer'
import { AbstractMessageStream } from '../stream/default-message-stream'
import { MessageStreamDirection } from '../stream/types'
import { AbstractMultiaddrConnection } from './abstract-multiaddr-connection'
import { BasicConnection } from './basic-connection'
import { DEFAULT_MAX_INBOUND_STREAMS, DEFAULT_MAX_OUTBOUND_STREAMS, Registrar } from './registrar'
import { AbortOptions, NewStreamOptions, PeerId } from './types'

const PROTOCOL_NEGOTIATION_TIMEOUT = 10_000
const CONNECTION_CLOSE_TIMEOUT = 1_000

export interface ConnectionComponents {
  registrar: Registrar
}

export interface ConnectionInit {
  id: string
  maConn: AbstractMultiaddrConnection
  stream: AbstractMessageStream
  remotePeer: PeerId
  direction?: MessageStreamDirection
  muxer?: MplexStreamMuxer
  cryptoProtocol?: string
  outboundStreamProtocolNegotiationTimeout?: number
  inboundStreamProtocolNegotiationTimeout?: number
  closeTimeout?: number
}

const isDirect = (multiaddr: Multiaddr): boolean => {
  return multiaddr.getComponents().find(component => component.code === CODE_P2P) != null
}

export class Connection extends BasicConnection {
  public direct: boolean

  private readonly muxer?: MplexStreamMuxer
  private readonly components: ConnectionComponents
  private readonly outboundStreamProtocolNegotiationTimeout: number
  private readonly inboundStreamProtocolNegotiationTimeout: number

  constructor (components: ConnectionComponents, init: ConnectionInit) {
    super({
      id: init.id,
      maConn: init.maConn,
      stream: init.stream,
      remotePeer: init.remotePeer,
      direction: init.direction,
      cryptoProtocol: init.cryptoProtocol,
      closeTimeout: init.closeTimeout
    })

    this.components = components
    this.muxer = init.muxer
    this.outboundStreamProtocolNegotiationTimeout = init.outboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.inboundStreamProtocolNegotiationTimeout = init.inboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.direct = isDirect(init.maConn.remoteAddr)

    this.onIncomingStream = this.onIncomingStream.bind(this)

    if (init.muxer != null) {
      this.multiplexer = init.muxer.protocol
      this.muxer.addEventListener('stream', this.onIncomingStream)
    }
  }

  override get streams () {
    return this.muxer?.streams ?? []
  }

  override async newStream (protocols: string | string[], options: NewStreamOptions = {}): Promise<any> {
    if (this.muxer == null) {
      throw new Error('Connection is not multiplexed')
    }

    if (this.muxer.status !== 'open') {
      throw new Error(`The connection muxer is "${this.muxer.status}" and not "open"`)
    }

    if (this.maConn.status !== 'open') {
      throw new Error(`The connection is "${this.status}" and not "open"`)
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
  override async close (options: AbortOptions = {}): Promise<void> {
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
    await super.close(options)
  }

  override abort (err: Error): void {
    this.muxer?.abort(err)
    super.abort(err)
  }
}

export function createConnection (components: ConnectionComponents, init: ConnectionInit): Connection {
  return new Connection(components, init)
}

