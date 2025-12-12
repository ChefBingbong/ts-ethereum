import type { Multiaddr } from '@multiformats/multiaddr'
import { Unix } from '@multiformats/multiaddr-matcher'
import debug from 'debug'
import type { Socket } from 'net'
import { pEvent, TimeoutError } from 'p-event'
import type { Uint8ArrayList } from 'uint8arraylist'
import { ipPortToMultiaddr } from '../../utils/multi-addr'
import { MessageStreamDirection, SendResult } from '../stream/types'
import { AbstractMultiaddrConnection } from './abstract-multiaddr-connection'
import { AbortOptions } from './types'

const log = debug('p2p:connection:multiaddr-connection')

export interface MultiAddressConnectionOptions {
  socket: Socket
  remoteAddr: Multiaddr
  direction: MessageStreamDirection
  inactivityTimeout?: number
  localAddr?: Multiaddr
}

class TCPSocketMultiaddrConnection extends AbstractMultiaddrConnection {
  private socket: Socket

  constructor (init: MultiAddressConnectionOptions) {
    let remoteAddr = init.remoteAddr

    // check if we are connected on a unix path
    if (init.localAddr != null && Unix.matches(init.localAddr)) {
      remoteAddr = init.localAddr
    } else if (remoteAddr == null) {
      if (init.socket.remoteAddress == null || init.socket.remotePort == null) {
        throw new Error('Could not determine remote address or port')
      }

      remoteAddr = ipPortToMultiaddr(init.socket.remoteAddress, init.socket.remotePort)
    }

    super({
      ...init,
      remoteAddr
    })

    this.socket = init.socket

    this.socket.on('data', buf => {
      this.onData(buf)
    })

    this.socket.on('error', err => {
      log('tcp error', remoteAddr, err)

      this.abort(err)
    })

    this.socket.setTimeout(init.inactivityTimeout ?? (2 * 60 * 1_000))

    this.socket.once('timeout', () => {
      log('tcp timeout', remoteAddr)
      this.abort(new TimeoutError())
    })

    this.socket.once('end', () => {
      log('tcp end', remoteAddr)
      this.onTransportClosed()
    })

    this.socket.once('close', hadError => {
      log('tcp close', remoteAddr)

      if (hadError) {
        this.abort(new Error('TCP transmission error'))
        return
      }

      this.onTransportClosed()
    })

    this.socket.on('drain', () => {
      log('tcp drain')

      this.safeDispatchEvent('drain')
    })
  }

  sendData (data: Uint8ArrayList): SendResult {
    let sentBytes = 0
    let canSendMore = true

    for (const buf of data) {
      sentBytes += buf.byteLength
      canSendMore = this.socket.write(buf)

      if (!canSendMore) {
        break
      }
    }

    return {
      sentBytes,
      canSendMore
    }
  }

  async sendClose (options?: AbortOptions): Promise<void> {
    if (this.socket.destroyed) {
      return
    }

    this.socket.destroySoon()

    await pEvent(this.socket, 'close', options)
  }

  sendReset (): void {
    this.socket.resetAndDestroy()
  }

  sendPause (): void {
    this.socket.pause()
  }

  sendResume (): void {
    this.socket.resume()
  }
}

export const toMultiaddrConnection = (init: MultiAddressConnectionOptions): AbstractMultiaddrConnection => {
  return new TCPSocketMultiaddrConnection(init)
}
