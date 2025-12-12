import type { Multiaddr } from '@multiformats/multiaddr'
import { CODE_P2P } from '@multiformats/multiaddr'
import debug from 'debug'
import { setMaxListeners, TypedEventEmitter } from 'main-event'
import { AbstractMessageStream as MessageStream } from '../stream/default-message-stream.ts'
import { MessageStreamDirection, MessageStreamEvents, StreamCloseEvent } from '../stream/types.ts'
import { AbstractMultiaddrConnection as MultiaddrConnection } from './abstract-multiaddr-connection.ts'
import { DEFAULT_MAX_INBOUND_STREAMS, DEFAULT_MAX_OUTBOUND_STREAMS, PeerId, Registrar } from './registrar.ts'
import { AbortOptions } from './types.ts'

const log = debug('p2p:connection:connection2')

export interface ConnectionComponents {
  registrar: Registrar
}

export interface ConnectionInit {
  id: string
  maConn: MultiaddrConnection
  stream: MessageStream
  remotePeer: PeerId
  direction?: MessageStreamDirection
//   muxer?: StreamMuxer
  cryptoProtocol?: string
//   limits?: ConnectionLimits
  outboundStreamProtocolNegotiationTimeout?: number
  inboundStreamProtocolNegotiationTimeout?: number
  closeTimeout?: number
}

const isDirect = (multiaddr: Multiaddr) => {
  return multiaddr.getComponents().find(component => component.code === CODE_P2P) != null
}

export class Connection extends TypedEventEmitter<MessageStreamEvents>  {
  public readonly id: string
  public readonly remoteAddr: Multiaddr
  public readonly remotePeer: PeerId
  public direction: MessageStreamDirection
  public direct: boolean
  public multiplexer?: string
  public encryption?: string

  private readonly maConn: MultiaddrConnection
//   private readonly muxer?: StreamMuxer
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
    this.outboundStreamProtocolNegotiationTimeout = init.outboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.inboundStreamProtocolNegotiationTimeout = init.inboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.closeTimeout = init.closeTimeout ?? CONNECTION_CLOSE_TIMEOUT
    this.direct = isDirect(init.maConn.remoteAddr)

    this.onIncomingStream = this.onIncomingStream.bind(this)

    if (this.remoteAddr.getComponents().find(component => component.code === CODE_P2P) == null) {
      this.remoteAddr = this.remoteAddr.encapsulate(`/p2p/${this.remotePeer}`)
    }

    // if (init.muxer != null) {
    //   this.multiplexer = init.muxer.protocol
    //   this.muxer = init.muxer
    //   this.muxer.addEventListener('stream', this.onIncomingStream)
    // }

    this.maConn.addEventListener('close', (evt) => {
      this.dispatchEvent(new StreamCloseEvent(evt.local, evt.error))
    })
  }


  newStream = async (protocols: string[], options: any = {}): Promise<Stream> => {
    // if (this.muxer == null) {
    //   throw new Error('Connection is not multiplexed')
    // }

    // if (this.muxer.status !== 'open') {
    //   throw new Error(`The connection muxer is "${this.muxer.status}" and not "open"`)
    // }

    if (this.maConn.status !== 'open') {
      throw new Error(`The connection is "${this.status}" and not "open"`)
    }

    if (!Array.isArray(protocols)) {
      protocols = [protocols]
    }

    log('starting new stream for protocols %s', protocols)
    const muxedStream = await this.muxer.createStream({
      ...options,

      // most underlying transports only support negotiating a single protocol
      // so only pass the early protocol if a single protocol has been requested
      // otherwise fall back to mss
      protocol: protocols.length === 1 ? protocols[0] : undefined
    })
    log('started new stream %s for protocols %s', muxedStream.id, protocols)

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

      const outgoingLimit = findOutgoingStreamLimit(muxedStream.protocol, this.components.registrar, options)
      const streamCount = countStreams(muxedStream.protocol, 'outbound', this)

      if (streamCount > outgoingLimit) {
        const err = new Error(`Too many outbound protocol streams for protocol "${muxedStream.protocol}" - ${streamCount}/${outgoingLimit}`)
        muxedStream.abort(err)

        throw err
      }

      return await this.runMiddlewareChain(muxedStream, this, [])
    } catch (err: any) {
      if (muxedStream.status === 'open') {
        muxedStream.abort(err)
      } else {
        log.error('could not create new outbound stream on connection %s %a for protocols %s - %e', this.direction === 'inbound' ? 'from' : 'to', this.remoteAddr, protocols, err)
      }

      throw err
    }
  }

  private async onIncomingStream (evt: CustomEvent<Stream>): Promise<void> {
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

      const incomingLimit = findIncomingStreamLimit(muxedStream.protocol, this.components.registrar)
      const streamCount = countStreams(muxedStream.protocol, 'inbound', this)

      if (streamCount > incomingLimit) {
        throw new Error(`Too many inbound protocol streams for protocol "${muxedStream.protocol}" - limit ${incomingLimit}`)
      }

      const { handler, options } = this.components.registrar.getHandler(muxedStream.protocol)

    //   const middleware = this.components.registrar.getMiddleware(muxedStream.protocol)

    //   middleware.push(async (stream, connection, next) => {
    //     await handler(stream, connection)
    //     next(stream, connection)
    //   })

      await this.runMiddlewareChain(muxedStream, this, [])
    } catch (err: any) {
      muxedStream.abort(err)
    }
  }

  private async runMiddlewareChain (stream: any, connection: any, middleware: any[]): Promise<any> {
    for (let i = 0; i < middleware.length; i++) {
      const mw = middleware[i]
      stream.log.trace('running middleware', i, mw)

      // eslint-disable-next-line no-loop-func
      await new Promise<void>((resolve, reject) => {
        try {
          const result = mw(stream, connection, (s, c) => {
            stream = s
            connection = c
            resolve()
          })

          if (result instanceof Promise) {
            result.catch(reject)
          }
        } catch (err) {
          reject(err)
        }
      })

      stream.log.trace('ran middleware', i, mw)
    }

    return stream
  }

  /**
   * Close the connection
   */
  async close (options: AbortOptions = {}): Promise<void> {
    this.log('closing connection to %a', this.remoteAddr)

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

export function createConnection (components: ConnectionComponents, init: ConnectionInit): ConnectionInterface {
  return new Connection(components, init)
}

function findIncomingStreamLimit (protocol: string, registrar: Registrar): number {
  try {
    const { options } = registrar.getHandler(protocol)

    if (options.maxInboundStreams != null) {
      return options.maxInboundStreams
    }
  } catch (err: any) {
    if (err.name !== 'UnhandledProtocolError') {
      throw err
    }
  }

  return DEFAULT_MAX_INBOUND_STREAMS
}

function findOutgoingStreamLimit (protocol: string, registrar: Registrar, options: NewStreamOptions = {}): number {
  try {
    const { options } = registrar.getHandler(protocol)

    if (options.maxOutboundStreams != null) {
      return options.maxOutboundStreams
    }
  } catch (err: any) {
    if (err.name !== 'UnhandledProtocolError') {
      throw err
    }
  }

  return options.maxOutboundStreams ?? DEFAULT_MAX_OUTBOUND_STREAMS
}

function countStreams (protocol: string, direction: 'inbound' | 'outbound', connection: Connection): number {
  let streamCount = 0

  connection.streams.forEach(stream => {
    if (stream.direction === direction && stream.protocol === protocol) {
      streamCount++
    }
  })

  return streamCount
}
