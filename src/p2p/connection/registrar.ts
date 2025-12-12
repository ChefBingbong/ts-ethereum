import type { TypedEventTarget } from 'main-event'
import { ProtocolHandler } from './protocol-manager.js'
import { AbortOptions, NetworkEvents, StreamHandlerOptions, StreamProtocolHandler } from './types.js'

export const DEFAULT_MAX_INBOUND_STREAMS = 32
export const DEFAULT_MAX_OUTBOUND_STEAMS = 64

export type PeerId = Uint8Array

export interface RegistrarOptions {
  peerId: PeerId
  events: TypedEventTarget<NetworkEvents>
}

export class Registrar {
  protected readonly handlers: Map<string, StreamProtocolHandler>
  protected readonly events: TypedEventTarget<NetworkEvents>
  protected readonly peerId: PeerId


  constructor (options: RegistrarOptions) {
    this.handlers = new Map<string, StreamProtocolHandler>()
    this.events = options.events
    this.peerId = options.peerId


    this.events.addEventListener('peer:disconnect', this._onDisconnect.bind(this))
    this.events.addEventListener('peer:update', this._onPeerUpdate.bind(this))
    this.events.addEventListener('peer:connect', this._onPeerIdentify.bind(this))
  }

  getProtocols () {
    return this.handlers.keys().toArray()
  }

  getHandler (protocol: string) {
    const handler = this.handlers.get(protocol)

    if (handler == null) {
      throw new Error(`No handler registered for protocol ${protocol}`)
    }

    return handler
  }

  async handle (protocol: string, handler: ProtocolHandler, opts?: StreamHandlerOptions) {
    if (this.handlers.has(protocol) && opts?.force !== true) {
      throw new Error(`Handler already registered for protocol ${protocol}`)
    }

    this.handlers.set(protocol, {
      handler,
      options: {
        maxInboundStreams: DEFAULT_MAX_INBOUND_STREAMS,
        maxOutboundStreams: DEFAULT_MAX_OUTBOUND_STEAMS,
        ...opts
      }
    })

  }

  async unhandle (protocols: string | string[], options?: AbortOptions) {
    const protocolList = Array.isArray(protocols) ? protocols : [protocols]

    for (const protocol of protocolList) {
      this.handlers.delete(protocol)
    }
  }

  async _onDisconnect (evt: CustomEvent<PeerId>){
    // TODO: Implement
  }

  async _onPeerUpdate (evt: CustomEvent<PeerId>){
    // TODO: Implement
  }

  async _onPeerIdentify (evt: CustomEvent<PeerId>){
    // TODO: Implement
  }
}
