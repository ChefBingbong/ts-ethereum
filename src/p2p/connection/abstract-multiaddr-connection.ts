import type { Multiaddr } from '@multiformats/multiaddr'
import debug from 'debug'
import { pEvent } from 'p-event'
import { AbstractMessageStream } from '../stream/default-message-stream'
import { MessageStreamDirection } from '../stream/types'
import { AbortOptions } from './types'

const log = debug('p2p:connection:abstract-multiaddr-connection')

export interface AbstractMultiaddrConnectionInit {
  remoteAddr: Multiaddr
  direction: MessageStreamDirection
  inactivityTimeout?: number
  localAddr?: Multiaddr
}

export abstract class AbstractMultiaddrConnection extends AbstractMessageStream {
  public remoteAddr: Multiaddr

  constructor (init: AbstractMultiaddrConnectionInit) {
    super(init)
    this.remoteAddr = init.remoteAddr
  }

  async close (options?: AbortOptions): Promise<void> {
    if (this.status !== 'open') return
    

    this.status = 'closing'
    this.writeStatus = 'closing'
    this.remoteWriteStatus = 'closing'
    this.remoteReadStatus = 'closing'

    // if we are currently sending data, wait for all the data to be written
    // into the underlying transport
    if (this.sendingData || this.writeBuffer.byteLength > 0) {
      log('waiting for write queue to become idle before closing writable end of stream, %d unsent bytes', this.writeBuffer.byteLength)
      await pEvent(this, 'idle', {
        ...options,
        rejectionEvents: [
          'close'
        ]
      })
    }

    // now that the underlying transport has all the data, if the buffer is full
    // wait for it to be emptied
    if (this.writableNeedsDrain) {
      log('waiting for write queue to drain before closing writable end of stream, %d unsent bytes', this.writeBuffer.byteLength)
      await pEvent(this, 'drain', {
        ...options,
        rejectionEvents: [
          'close'
        ]
      })
    }

    await this.sendClose(options)

    this.onTransportClosed()
  }

  /**
   * Wait for any unsent data to be written to the underlying resource, then
   * close the resource and resolve the returned promise
   */
  abstract sendClose (options?: AbortOptions): Promise<void>
}
