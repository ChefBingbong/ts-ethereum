import { CODE_P2P } from '@multiformats/multiaddr'
import { anySignal, ClearableSignal } from 'any-signal'
import { setMaxListeners } from 'main-event'
import { PeerInfo } from '../../kademlia'
import { ConnectionEncrypter, EcciesEncrypter } from '../connection-encrypters/eccies'
import { StreamMuxerFactory } from '../muxer'
import { AbstractMessageStream as MessageStream } from '../stream/default-message-stream'
import { AbstractMultiaddrConnection as MultiaddrConnection } from './abstract-multiaddr-connection'
import { Connection, createConnection } from './connection2'
import { Registrar } from './registrar'
import { AbortOptions } from './types'

interface CreateConnectionOptions {
  id: string
  cryptoProtocol: string
  direction: 'inbound' | 'outbound'
  maConn: MultiaddrConnection
  stream: MessageStream

  remotePeer: PeerInfo
  muxer: StreamMuxerFactory
  closeTimeout?: number
}


export interface SecuredConnection<Extension = unknown> {
    connection: MessageStream
    remoteExtensions?: Extension
    remotePeer: PeerInfo
    streamMuxer?: StreamMuxerFactory
  }
  

export interface UpgraderInit {
  privateKey: Uint8Array
  id: Uint8Array
  remoteId: Uint8Array
  connectionEncrypters: ConnectionEncrypter[]
  inboundUpgradeTimeout?: number
  inboundStreamProtocolNegotiationTimeout?: number
  streamMuxer: StreamMuxerFactory
  outboundStreamProtocolNegotiationTimeout?: number
  connectionCloseTimeout?: number
}

export interface UpgraderComponents {
  peerId: PeerInfo
//   connectionManager: ConnectionManager
//   connectionGater: ConnectionGater
//   connectionProtector?: ConnectionProtector
  registrar: Registrar
//   peerStore: PeerStore
//   events: TypedEventTarget<Libp2pEvents>
}

interface EncryptedConnection extends SecuredConnection {
  protocol: string
}

export const INBOUND_UPGRADE_TIMEOUT = 10_000
export const PROTOCOL_NEGOTIATION_TIMEOUT = 10_000
export const CONNECTION_CLOSE_TIMEOUT = 1_000

export class Upgrader  {
  private readonly connectionEncrypter: EcciesEncrypter
  private readonly streamMuxer: StreamMuxerFactory
  private readonly inboundUpgradeTimeout: number
  private readonly inboundStreamProtocolNegotiationTimeout: number
  private readonly outboundStreamProtocolNegotiationTimeout: number
//   private readonly events: TypedEventTarget<Libp2pEvents>
  private readonly connectionCloseTimeout?: number

  constructor (components: UpgraderComponents, init: UpgraderInit) {
    this.connectionEncrypter = new EcciesEncrypter(init.privateKey, { requireEip8: true, id: init.id, remoteId: init.remoteId })
    this.streamMuxer= init.streamMuxer
    // init.streamMuxers.forEach(muxer => {
    //   this.streamMuxers.set(muxer.protocol, muxer)
    // })

    this.inboundUpgradeTimeout = init.inboundUpgradeTimeout ?? INBOUND_UPGRADE_TIMEOUT
    this.inboundStreamProtocolNegotiationTimeout = init.inboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.outboundStreamProtocolNegotiationTimeout = init.outboundStreamProtocolNegotiationTimeout ?? PROTOCOL_NEGOTIATION_TIMEOUT
    this.connectionCloseTimeout = init.connectionCloseTimeout ?? CONNECTION_CLOSE_TIMEOUT
    // this.events = components.events
  }


  createInboundAbortSignal (signal: AbortSignal): ClearableSignal {
    const output = anySignal([
      AbortSignal.timeout(this.inboundUpgradeTimeout),
      signal
    ])
    setMaxListeners(Infinity, output)

    return output
  }

  async upgradeInbound (maConn: MultiaddrConnection, opts: { initiator: boolean, signal: AbortSignal }): Promise<void> {
    const signal = this.createInboundAbortSignal(opts.signal)

    try {
      await this._performUpgrade(maConn, 'inbound')
    } catch (err: any) {
      throw err
    } finally {
      signal.clear()
    }
  }

  async upgradeOutbound (maConn: MultiaddrConnection, opts: { initiator: boolean, signal: AbortSignal }): Promise<Connection> {
    try {
      let direction: 'inbound' | 'outbound' = 'outbound'

      // act as the multistream-select server if we are not to be the initiator
      if (opts.initiator === false) {
        direction = 'inbound'
      }

      return await this._performUpgrade(maConn, direction, opts)
    } catch (err: any) {
      throw err
    }
  }

  private async _performUpgrade (maConn: MultiaddrConnection, direction: 'inbound' | 'outbound'): Promise<Connection> {
    let stream: MessageStream = maConn
    let remotePeer: PeerId
    let muxerFactory: StreamMuxerFactory | undefined
    let muxer: StreamMuxer | undefined
    let cryptoProtocol

    const id = `${(parseInt(String(Math.random() * 1e9))).toString(36)}${Date.now()}`
    try {
        const peerIdString = maConn.remoteAddr.getComponents().findLast(c => c.code === CODE_P2P)?.value
        let remotePeerFromMultiaddr: PeerId | undefined

        if (peerIdString != null) {
          remotePeerFromMultiaddr = peerIdFromString(peerIdString)
        }

        ({
          connection: stream,
          remotePeer,
          protocol: cryptoProtocol,
          streamMuxer: muxerFactory
        } = await (direction === 'inbound'
          ? this._encryptInbound(stream, )
          : this._encryptOutbound(stream, )
        ))

      // this can happen if we dial a multiaddr without a peer id, we only find
      // out the identity of the remote after the connection is encrypted
      if (remotePeer.equals(this.components.peerId)) {
        const err = new Error(`Can not dial self: ${remotePeer.toString()}`)
        maConn.abort(err)
        throw err
      }


      muxerFactory = await (direction === 'inbound'
        ? this._multiplexInbound(stream, this.streamMuxers, opts)
        : this._multiplexOutbound(stream, this.streamMuxers, opts))
    
    } catch (err: any) {
      maConn.log.error('failed to upgrade %s connection %s %a - %e', direction, direction === 'inbound' ? 'from' : 'to', maConn.remoteAddr, err)
      throw err
    }

    // create the connection muxer if one is configured
    if (muxerFactory != null) {
      maConn.log('create muxer %s', muxerFactory.protocol)
      muxer = muxerFactory.createStreamMuxer(stream)
    }


   return this._createConnection({
      id,
      cryptoProtocol,
      direction,
      maConn,
      stream,
      muxer,
      remotePeer,
      closeTimeout: this.connectionCloseTimeout
    })
  }

  /**
   * A convenience method for generating a new `Connection`
   */
  _createConnection (opts: CreateConnectionOptions): Connection {
    // Create the connection
    const connection = createConnection(this.components, {
      ...opts,
      outboundStreamProtocolNegotiationTimeout: this.outboundStreamProtocolNegotiationTimeout,
      inboundStreamProtocolNegotiationTimeout: this.inboundStreamProtocolNegotiationTimeout
    })

    connection.addEventListener('close', () => {
      this.events.safeDispatchEvent('connection:close', {
        detail: connection
      })
    })

    this.events.safeDispatchEvent('connection:open', {
      detail: connection
    })

    return connection
  }

  /**
   * Attempts to encrypt the incoming `connection` with the provided `cryptos`
   */
  async _encryptInbound (connection: MessageStream): Promise<EncryptedConnection> {
    const protocols = ['eccies']

    try {
      const protocol = await mss.handle(connection, protocols, options)
      const encrypter = this.connectionEncrypter.get(protocol)

      if (encrypter == null) {
        throw new Error(`no crypto module found for ${protocol}`)
      }

      connection.log('encrypting inbound connection using %s', protocol)

      return {
        ...await this.connectionEncrypter.secureInBound(connection) as any,
        protocol: 'eccies'
      }
    } catch (err: any) {
      throw new Error(err.message)
    }
  }

  /**
   * Attempts to encrypt the given `connection` with the provided connection encrypters.
   * The first `ConnectionEncrypter` module to succeed will be used
   */
  async _encryptOutbound (connection: MessageStream): Promise<EncryptedConnection> {
    const protocols = Array.from(this.connectionEncrypter.keys())

    try {
      connection.log.trace('selecting encrypter from %s', protocols)

      const protocol = await mss.select(connection, protocols, options)
      const encrypter = this.connectionEncrypter.get(protocol)

      if (encrypter == null) {
        throw new Error(`no crypto module found for ${protocol}`)
      }

      connection.log('encrypting outbound connection using %s', protocol)

      return {
        ...await this.connectionEncrypter.secureOutBound(connection, null) as any,
        protocol: 'eccies'
      }
    } catch (err: any) {
      throw new Error(err.message)
    }
  }

  /**
   * Selects one of the given muxers via multistream-select. That
   * muxer will be used for all future streams on the connection.
   */
  async _multiplexOutbound (maConn: MessageStream, muxers: Map<string, StreamMuxerFactory>, options: AbortOptions): Promise<StreamMuxerFactory> {
    const protocols = Array.from(muxers.keys())

    try {
      const protocol = await mss.select(maConn, protocols, options)
      const muxerFactory = muxers.get(protocol)

      if (muxerFactory == null) {
        throw new Error(`No muxer configured for protocol "${protocol}"`)
      }

      return muxerFactory
    } catch (err: any) {
      throw new Error(String(err))
    }
  }

  /**
   * Registers support for one of the given muxers via multistream-select. The
   * selected muxer will be used for all future streams on the connection.
   */
  async _multiplexInbound (maConn: MessageStream, muxers: Map<string, StreamMuxerFactory>, options: AbortOptions): Promise<StreamMuxerFactory> {
    const protocols = Array.from(muxers.keys())
    try {
      const protocol = await mss.handle(maConn, protocols, options)
      const muxerFactory = muxers.get(protocol)

      if (muxerFactory == null) {
        throw new Error(`No muxer configured for protocol "${protocol}"`)
      }

      return muxerFactory
    } catch (err: any) {
      throw err
    }
  }

  getConnectionEncrypters () {
    return this.connectionEncrypter
  }

  getStreamMuxers (): StreamMuxerFactory {
    return this.streamMuxer
  }
}
