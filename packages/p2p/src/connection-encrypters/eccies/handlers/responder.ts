import debug from 'debug'
import {
  BufferAccumulator,
  createAckEIP8,
  createAckOld,
  parseAuthEIP8,
  parseAuthPlain,
  type AuthResult,
  type HandlerContext,
} from '../utils'

const log = debug('p2p:ecies:responder')

export type WaitAuthSendAckResult = {
  authMsg: Uint8Array
  authResult: AuthResult
  ackMsg: Uint8Array
  gotEIP8Auth: boolean
}

function createAckMessage(
  ctx: HandlerContext,
  gotEIP8Auth: boolean,
): Uint8Array {
  let ackMsg: Uint8Array | undefined
  if (gotEIP8Auth) {
    ackMsg = createAckEIP8(
      ctx.ephemeralPublicKey,
      ctx.remotePublicKey!,
      ctx.nonce,
    )
  } else {
    ackMsg = createAckOld(
      ctx.ephemeralPublicKey,
      ctx.remotePublicKey!,
      ctx.nonce,
    )
  }
  if (!ackMsg) throw new Error('Failed to create ACK message')
  return ackMsg
}

export function waitAuthSendAck(
  ctx: HandlerContext,
  timeoutMs = 10000,
): Promise<WaitAuthSendAckResult> {
  return new Promise((resolve, reject) => {
    const accumulator = new BufferAccumulator(307, (authPacket, isEIP8) => {
      cleanup()
      try {
        let authResult: AuthResult | null
        if (isEIP8) {
          authResult = parseAuthEIP8(
            authPacket,
            ctx.privateKey,
            ctx.ephemeralPrivateKey,
            true,
          )
        } else {
          authResult = parseAuthPlain(
            authPacket,
            ctx.privateKey,
            ctx.ephemeralPrivateKey,
            false,
          )
        }
        if (!authResult) {
          reject(new Error('Failed to parse AUTH'))
          return
        }
        ctx.remotePublicKey = authResult.remotePublicKey
        const ackMsg = createAckMessage(ctx, isEIP8)
        ctx.socket.write(ackMsg)
        log('AUTH←ACK complete')
        resolve({
          authMsg: authPacket,
          authResult,
          ackMsg,
          gotEIP8Auth: isEIP8,
        })
      } catch (err) {
        reject(err)
      }
    })

    const onData = (data: Uint8Array) => accumulator.onData(data)
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    const cleanup = () => {
      clearTimeout(timer)
      ctx.socket.off('data', onData)
      ctx.socket.off('error', onError)
    }
    const onTimeout = () => {
      cleanup()
      try {
        ctx.socket.destroy()
      } catch {}
      reject(new Error(`Waiting for AUTH timeout after ${timeoutMs}ms`))
    }

    const timer = setTimeout(onTimeout, timeoutMs)
    ctx.socket.on('data', onData)
    ctx.socket.once('error', onError)
    log('Waiting for AUTH...')
  })
}
