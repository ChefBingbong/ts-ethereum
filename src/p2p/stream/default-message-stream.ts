import debug from 'debug'
import { pushable } from 'it-pushable'
import { EventHandler, TypedEventEmitter } from 'main-event'
import { raceSignal } from 'race-signal'
import { Uint8ArrayList } from 'uint8arraylist'
import { AbortOptions } from '../connection'
import { MessageStreamDirection, MessageStreamEvents, MessageStreamReadStatus, MessageStreamStatus, MessageStreamWriteStatus, SendResult, StreamAbortEvent, StreamCloseEvent, StreamMessageEvent, StreamResetEvent } from './types'

const log = debug('p2p:stream:default-message-stream')

const DEFAULT_MAX_READ_BUFFER_LENGTH = Math.pow(2, 20) * 4 // 4MB

export abstract class AbstractMessageStream extends TypedEventEmitter<MessageStreamEvents>  {
  public status: MessageStreamStatus
  public inactivityTimeout: number
  public maxReadBufferLength: number
  public maxWriteBufferLength?: number
  public direction: MessageStreamDirection
  public maxMessageSize?: number
  public readStatus: MessageStreamReadStatus
  public writeStatus: MessageStreamWriteStatus
  public remoteReadStatus: MessageStreamReadStatus
  public remoteWriteStatus: MessageStreamWriteStatus

  public writableNeedsDrain: boolean

  protected readonly readBuffer: Uint8ArrayList
  protected readonly writeBuffer: Uint8ArrayList
  protected sendingData: boolean

  private onDrainPromise?: PromiseWithResolvers<void>

  constructor (init: any) {
    super()

    this.status = 'open'
    this.direction = init.direction ?? 'outbound'
    this.inactivityTimeout = init.inactivityTimeout ?? 120_000
    this.maxReadBufferLength = init.maxReadBufferLength ?? DEFAULT_MAX_READ_BUFFER_LENGTH
    this.maxWriteBufferLength = init.maxWriteBufferLength
    this.maxMessageSize = init.maxMessageSize
    this.readBuffer = new Uint8ArrayList()
    this.writeBuffer = new Uint8ArrayList()

    this.readStatus = 'readable'
    this.remoteReadStatus = 'readable'
    this.writeStatus = 'writable'
    this.remoteWriteStatus = 'writable'
    this.sendingData = false
    this.writableNeedsDrain = false

    this.processSendQueue = this.processSendQueue.bind(this)

    const continueSendingOnDrain = (): void => {
      if (this.writableNeedsDrain) {
        log('drain event received, continue sending data')
        this.writableNeedsDrain = false
        this.processSendQueue()
      }

      this.onDrainPromise?.resolve()
    }
    this.addEventListener('drain', continueSendingOnDrain)

    const rejectOnDrainOnClose = (evt: StreamCloseEvent): void => {
      this.onDrainPromise?.reject(evt.error ?? new Error())
    }
    this.addEventListener('close', rejectOnDrainOnClose)
  }

  get readBufferLength (): number {
    return this.readBuffer.byteLength
  }

  get writeBufferLength (): number {
    return this.writeBuffer.byteLength
  }

  async onDrain (options?: AbortOptions){
    if (this.writableNeedsDrain !== true) {
      return Promise.resolve()
    }

    if (this.onDrainPromise == null) {
      this.onDrainPromise = Promise.withResolvers()
    }

    return raceSignal(this.onDrainPromise.promise, options?.signal)
  }

  async * [Symbol.asyncIterator] (): AsyncGenerator<Uint8Array | Uint8ArrayList> {
    if (this.readStatus !== 'readable' && this.readStatus !== 'paused') {
      return
    }

    const output = pushable<Uint8Array | Uint8ArrayList>()

    const streamAsyncIterableOnMessageListener = (evt: StreamMessageEvent): void => {
      output.push(evt.data)
    }
    this.addEventListener('message', streamAsyncIterableOnMessageListener)

    const streamAsyncIterableOnCloseListener = (evt: StreamCloseEvent): void => {
      output.end(evt.error)
    }
    this.addEventListener('close', streamAsyncIterableOnCloseListener)

    const streamAsyncIterableOnRemoteCloseWriteListener = (): void => {
      output.end()
    }
    this.addEventListener('remoteCloseWrite', streamAsyncIterableOnRemoteCloseWriteListener)

    try {
      yield * output
    } finally {
      this.removeEventListener('message', streamAsyncIterableOnMessageListener)
      this.removeEventListener('close', streamAsyncIterableOnCloseListener)
      this.removeEventListener('remoteCloseWrite', streamAsyncIterableOnRemoteCloseWriteListener)
    }
  }

  isReadable () {
    return this.status === 'open'
  }

  send (data: Uint8Array | Uint8ArrayList) {
    if (this.writeStatus === 'closed' || this.writeStatus === 'closing') {
      throw new Error(`Cannot write to a stream that is ${this.writeStatus}`)
    }

    log('append %d bytes to write buffer', data.byteLength)
    this.writeBuffer.append(data)

    return this.processSendQueue()
  }

  abort (err: Error) {
    if (this.status === 'aborted' || this.status === 'reset' || this.status === 'closed') {
      return
    }

    log.error('abort with error - %e', err)

    this.status = 'aborted'

    // throw away unread data
    if (this.readBuffer.byteLength > 0) {
      this.readBuffer.consume(this.readBuffer.byteLength)
    }

    // throw away unsent data
    if (this.writeBuffer.byteLength > 0) {
      this.writeBuffer.consume(this.writeBuffer.byteLength)
      this.safeDispatchEvent('idle')
    }

    this.writeStatus = 'closed'
    this.remoteWriteStatus = 'closed'

    this.readStatus = 'closed'
    this.remoteReadStatus = 'closed'

    try {
      this.sendReset(err)
    } catch (err: any) {
      log('failed to send reset to remote - %e', err)
    }

    this.dispatchEvent(new StreamAbortEvent(err))
  }

  pause () {
    if (this.readStatus === 'closed' || this.readStatus === 'closing') {
      throw new Error('Cannot pause a stream that is closing/closed')
    }

    if (this.readStatus === 'paused') {
      return
    }

    this.readStatus = 'paused'
    this.sendPause()
  }

  resume () {
    if (this.readStatus === 'closed' || this.readStatus === 'closing') {
      throw new Error('Cannot resume a stream that is closing/closed')
    }

    if (this.readStatus === 'readable') {
      return
    }

    this.readStatus = 'readable'
    this.dispatchReadBuffer()
    this.sendResume()
  }

  push (data: Uint8Array | Uint8ArrayList) {
    if (this.readStatus === 'closed' || this.readStatus === 'closing') {
      throw new Error(`Cannot push data onto a stream that is ${this.readStatus}`)
    }

    if (data.byteLength === 0) {
      return
    }

    this.readBuffer.append(data)

    if (this.readStatus === 'paused' || this.listenerCount('message') === 0) {
      // abort if the read buffer is too large
      this.checkReadBufferLength()

      return
    }

    setTimeout(() => {
      this.dispatchReadBuffer()
    }, 0)
  }

  unshift (data: Uint8Array | Uint8ArrayList) {
    if (this.readStatus === 'closed' || this.readStatus === 'closing') {
      throw new Error(`Cannot push data onto a stream that is ${this.readStatus}`)
    }

    if (data.byteLength === 0) {
      return
    }

    this.readBuffer.prepend(data)

    if (this.readStatus === 'paused' || this.listenerCount('message') === 0) {
      this.checkReadBufferLength()

      return
    }

    setTimeout(() => {
      this.dispatchReadBuffer()
    }, 0)
  }

  onData (data: Uint8Array | Uint8ArrayList) {
    if (data.byteLength === 0) {
      return
    }

    // discard the data if our readable end is closed
    if (this.readStatus === 'closing' || this.readStatus === 'closed') {
      log('ignoring data - read status %s', this.readStatus)
      return
    }

    this.readBuffer.append(data)
    this.dispatchReadBuffer()
  }

  addEventListener(type: keyof MessageStreamEvents, listener?: EventHandler<keyof MessageStreamEvents>, options?: boolean | AddEventListenerOptions): void
  addEventListener (type: string, listener: EventHandler<Event>, options?: boolean | AddEventListenerOptions): void
  addEventListener (...args: any[]): void {
    super.addEventListener.apply(this, args)

    // if a 'message' listener is being added and we have queued data, dispatch
    // the data
    if (args[0] === 'message' && this.readBuffer.byteLength > 0) {
      // event listeners can be added in constructors and often use object
      // properties - if this the case we can access a class member before it
      // has been initialized so dispatch the message in the microtask queue
      queueMicrotask(() => {
        this.dispatchReadBuffer()
      })
    }
  }

  /**
   * Receive a reset message - close immediately for reading and writing (remote
   * error)
   */
  onRemoteReset () {
    log('remote reset')

    this.status = 'reset'
    this.writeStatus = 'closed'
    this.remoteWriteStatus = 'closed'
    this.remoteReadStatus = 'closed'

    if (this.readBuffer.byteLength === 0) {
      this.readStatus = 'closed'
    }

    const err = new Error()
    this.dispatchEvent(new StreamResetEvent(err))
  }

  onTransportClosed (err?: Error) {
    log('transport closed')

    if (this.readStatus === 'readable' && this.readBuffer.byteLength === 0) {
      log('close readable end after transport closed and read buffer is empty')
      this.readStatus = 'closed'
    }

    if (this.remoteReadStatus !== 'closed') {
      this.remoteReadStatus = 'closed'
    }

    if (this.remoteWriteStatus !== 'closed') {
      this.remoteWriteStatus = 'closed'
    }

    if (this.writeStatus !== 'closed') {
      this.writeStatus = 'closed'
    }

    if (err != null) {
      this.abort(err)
    } else {
      if (this.status === 'open' || this.status === 'closing') {
        this.status = 'closed'
        this.writeStatus = 'closed'
        this.remoteWriteStatus = 'closed'
        this.remoteReadStatus = 'closed'
        this.dispatchEvent(new StreamCloseEvent())
      }
    }
  }

  onRemoteCloseWrite () {
    if (this.remoteWriteStatus === 'closed') {
      return
    }

    log('on remote close write')

    this.remoteWriteStatus = 'closed'

    this.safeDispatchEvent('remoteCloseWrite')

    if (this.writeStatus === 'closed') {
      this.onTransportClosed()
    }
  }

  onRemoteCloseRead () {
    log('on remote close read')

    this.remoteReadStatus = 'closed'

    // throw away any unsent bytes if the remote closes it's readable end
    if (this.writeBuffer.byteLength > 0) {
      this.writeBuffer.consume(this.writeBuffer.byteLength)
      this.safeDispatchEvent('idle')
    }
  }

  protected processSendQueue () {
    // bail if the underlying transport is full
    if (this.writableNeedsDrain) {
      log('not processing send queue as drain is required')
      this.checkWriteBufferLength()

      return false
    }

    // bail if there is no data to send
    if (this.writeBuffer.byteLength === 0) {
      log('not processing send queue as no bytes to send')
      return true
    }

    // bail if we are already sending data
    if (this.sendingData) {
      log('not processing send queue as already sending data')
      return true
    }

    this.sendingData = true

    log('processing send queue with %d queued bytes', this.writeBuffer.byteLength)

    try {
      let canSendMore = true
      const totalBytes = this.writeBuffer.byteLength
      let sentBytes = 0

      // send as much data as possible while we have data to send and the
      // underlying muxer can still accept data
      while (this.writeBuffer.byteLength > 0) {
        const end = Math.min(this.maxMessageSize ?? this.writeBuffer.byteLength, this.writeBuffer.byteLength)

        // this can happen if a subclass changes the max message size dynamically
        if (end === 0) {
          canSendMore = false
          break
        }

        // chunk to send to the remote end
        const toSend = this.writeBuffer.sublist(0, end)

        // copy toSend in case the extending class modifies the list
        const willSend = new Uint8ArrayList(toSend)

        this.writeBuffer.consume(toSend.byteLength)

        // sending data can cause buffers to fill up, events to be emitted and
        // this method to be invoked again
        const sendResult = this.sendData(toSend)
        canSendMore = sendResult.canSendMore
        sentBytes += sendResult.sentBytes

        if (sendResult.sentBytes !== willSend.byteLength) {
          willSend.consume(sendResult.sentBytes)
          this.writeBuffer.prepend(willSend)
        }

        if (!canSendMore) {
          break
        }
      }

      if (!canSendMore) {
        log('sent %d/%d bytes, pausing sending because underlying stream is full, %d bytes left in the write buffer', sentBytes, totalBytes, this.writeBuffer.byteLength)
        this.writableNeedsDrain = true
        this.checkWriteBufferLength()
      }

      // we processed all bytes in the queue, resolve the write queue idle promise
      if (this.writeBuffer.byteLength === 0) {
        this.safeDispatchEvent('idle')
      }

      return canSendMore
    } finally {
      this.sendingData = false
    }
  }

  protected dispatchReadBuffer (): void {
    try {
      if (this.listenerCount('message') === 0) {
        log('not dispatching pause buffer as there are no listeners for the message event')
        return
      }

      if (this.readBuffer.byteLength === 0) {
        log('not dispatching pause buffer as there is no data to dispatch')
        return
      }

      if (this.readStatus === 'paused') {
        log('not dispatching pause buffer we are paused')
        return
      }

      // discard the pause buffer if our readable end is closed
      if (this.readStatus === 'closing' || this.readStatus === 'closed') {
        log('dropping %d bytes because the readable end is %s', this.readBuffer.byteLength, this.readStatus)
        this.readBuffer.consume(this.readBuffer.byteLength)
        return
      }

      const buf = this.readBuffer.sublist()
      this.readBuffer.consume(buf.byteLength)

      this.dispatchEvent(new StreamMessageEvent(buf))
    } finally {
      if (this.readBuffer.byteLength === 0 && this.remoteWriteStatus === 'closed') {
        log('close readable end after dispatching read buffer and remote writable end is closed')
        this.readStatus = 'closed'
      }

      // abort if we failed to consume the read buffer and it is too large
      this.checkReadBufferLength()
    }
  }

  private checkReadBufferLength () {
    if (this.readBuffer.byteLength > this.maxReadBufferLength) {
      this.abort(new Error(`Read buffer length of ${this.readBuffer.byteLength} exceeded limit of ${this.maxReadBufferLength}, read status is ${this.readStatus}`))
    }
  }

  private checkWriteBufferLength () {
    if (this.maxWriteBufferLength == null) {
      return
    }

    if (this.writeBuffer.byteLength > this.maxWriteBufferLength) {
      this.abort(new Error(`Write buffer length of ${this.writeBuffer.byteLength} exceeded limit of ${this.maxWriteBufferLength}, write status is ${this.writeStatus}`))
    }
  }

  public onMuxerNeedsDrain () {
    this.writableNeedsDrain = true
  }

  public onMuxerDrain () {
    this.safeDispatchEvent('drain')
  }


  abstract sendData (data: Uint8ArrayList): SendResult
  abstract sendReset (err: Error)
  abstract sendPause ()
  abstract sendResume ()
  abstract close (options?: AbortOptions): Promise<void>
}
