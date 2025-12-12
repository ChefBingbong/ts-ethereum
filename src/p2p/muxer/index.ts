import { AbstractMultiaddrConnection as MultiaddrConnection } from '../connection/abstract-multiaddr-connection.js'
import { MplexStreamMuxer } from './mplex.js'

export type MplexInit = {}

export interface StreamMuxerFactory {
  protocol: string
  createStreamMuxer(maConn: MultiaddrConnection): any
}
class Mplex {
  public protocol = '/mplex/6.7.0'
  private readonly _init: MplexInit

  constructor (init: MplexInit = {}) {
    this._init = init
  }


  createStreamMuxer (maConn: MultiaddrConnection) {
    return new MplexStreamMuxer(maConn, {
      ...this._init
    })
  }
}

export function mplex (init: MplexInit = {}): () => StreamMuxerFactory {
  return () => new Mplex(init)
}
