import type { Multiaddr } from '@multiformats/multiaddr'
import { Unix } from '@multiformats/multiaddr-matcher'
import type { Socket } from 'net'
import { pEvent, TimeoutError } from 'p-event'
import type { Uint8ArrayList } from 'uint8arraylist'
import { ipPortToMultiaddr } from '../../utils/multi-addr'
import { MessageStreamDirection, SendResult } from '../stream/types'
import { AbstractMultiaddrConnection } from './abstract-multiaddr-connection'
import { AbortOptions } from './types'

export interface MultiAddressConnectionOptions {
  socket: Socket
  remoteAddr: Multiaddr
  direction: MessageStreamDirection
  inactivityTimeout?: number
  localAddr?: Multiaddr
  remotePeerId?: Uint8Array
}

class TCPSocketMultiaddrConnection extends AbstractMultiaddrConnection {
  public socket: Socket
  public remotePeerId?: Uint8Array

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
      remoteAddr,
      logNamespace: `p2p:maconn:${remoteAddr.toString()}`
    })

    this.socket = init.socket
    this.remotePeerId = init.remotePeerId

    this.socket.on('data', buf => {
      this.onData(buf)
    })

    this.socket.on('error', err => {
      this.log('tcp error %s %s', remoteAddr.toString(), err.message)
      this.abort(err)
    })

    this.socket.setTimeout(init.inactivityTimeout ?? (2 * 60 * 1_000))

    this.socket.once('timeout', () => {
      this.log('tcp timeout %s', remoteAddr.toString())
      this.abort(new TimeoutError())
    })

    this.socket.once('end', () => {
      this.log('tcp end %s', remoteAddr.toString())
      this.onTransportClosed()
    })

    this.socket.once('close', hadError => {
      this.log('tcp close %s', remoteAddr.toString())

      if (hadError) {
        this.abort(new Error('TCP transmission error'))
        return
      }

      this.onTransportClosed()
    })

    this.socket.on('drain', () => {
      this.log('tcp drain')
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
