import debug from 'debug'
import { pEvent } from 'p-event'
import { AbortOptions } from '../connection/types.js'
import { AbstractMessageStream } from './default-message-stream.js'

const log = debug('p2p:stream:abstract-stream')

export interface AbstractStreamInit  {
  /**
   * A unique identifier for this stream
   */
  id: string

  /**
   * The protocol name for the stream, if it is known
   */
  protocol?: string
}

export abstract class AbstractStream extends AbstractMessageStream {
  public id: string
  public protocol: string

  constructor (init: AbstractStreamInit) {
    super(init)

    this.id = init.id
    this.protocol = init.protocol ?? ''
  }

  async close (options?: AbortOptions): Promise<void> {
    if (this.writeStatus === 'closing' || this.writeStatus === 'closed') {
      return
    }

    this.writeStatus = 'closing'

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
      log('waiting for write queue to drain before closing writable end of stream, %d unsent bytes, sending %s', this.writeBuffer.byteLength, this.sendingData)
      await pEvent(this, 'drain', {
        ...options,
        rejectionEvents: [
          'close'
        ]
      })
      log('write queue drained, closing writable end of stream, %d unsent bytes, sending %s', this.writeBuffer.byteLength, this.sendingData)
    }

    await this.sendCloseWrite(options)

    this.writeStatus = 'closed'

    log('closed writable end gracefully')

    if (this.remoteWriteStatus === 'closed') {
      this.onTransportClosed()
    }
  }

  async closeRead (options?: AbortOptions): Promise<void> {
    if (this.readStatus === 'closing' || this.readStatus === 'closed') {
      return
    }

    // throw away any unread data
    if (this.readBuffer.byteLength > 0) {
      this.readBuffer.consume(this.readBuffer.byteLength)
    }

    this.readStatus = 'closing'

    await this.sendCloseRead(options)

    this.readStatus = 'closed'

    log('closed readable end gracefully')
  }

  /**
   * Send a message to the remote end of the stream, informing them that we will
   * send no more data messages.
   */
  abstract sendCloseWrite (options?: AbortOptions): Promise<void>

  /**
   * If supported, send a message to the remote end of the stream, informing
   * them that we will read no more data messages.
   */
  abstract sendCloseRead (options?: AbortOptions): Promise<void>
}
