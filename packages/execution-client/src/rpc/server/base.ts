import type { ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Logger } from 'winston'
import { isLocalhostIP } from '../../util/ip'
import { INTERNAL_ERROR, INVALID_REQUEST } from '../error-code'
import { getRpcErrorResponse } from '../helpers'
import type { RpcApiEnv } from '../types'

export type RpcServerOpts = {
  port: number
  cors?: string
  address?: string
  bodyLimit?: number
  stacktraces?: boolean
  debug?: boolean
}

export type RpcServerModules = {
  logger: Logger
}

export class RpcServerBase {
  protected readonly app: Hono<RpcApiEnv>
  protected server?: ServerType
  protected readonly logger: Logger
  protected isListening = false

  constructor(
    protected opts: RpcServerOpts,
    modules: RpcServerModules,
  ) {
    const app = new Hono<RpcApiEnv>()
    this.logger = modules.logger

    app.use('*', cors({ origin: opts.cors ?? '*' }))
    app.onError(this.onError.bind(this) as any)
    app.notFound(this.onNotFound.bind(this))
    this.app = app
  }

  async listen(): Promise<void> {
    if (this.isListening) return
    this.isListening = true
    return new Promise<void>((resolve, reject) => {
      try {
        const server = serve(
          {
            fetch: this.app.fetch,
            port: this.opts.port,
            hostname: this.opts.address ?? '127.0.0.1',
          },
          (info) => this.onListening(server, info, resolve, reject),
        )
      } catch (e) {
        this.logger.error('Error starting RPC server', this.opts, e as Error)
        this.isListening = false
        reject(e)
      }
    })
  }

  async close(): Promise<void> {
    try {
      if (!this.isListening) return

      await this.server?.close?.()
      this.isListening = false
      this.logger.debug('RPC server closed')
    } catch (e) {
      this.logger.error('Error closing RPC server', {}, e as Error)
      throw e
    }
  }

  protected shouldIgnoreError(_err: Error): boolean {
    return false
  }

  private onError(err: Error, c: Context<RpcApiEnv>) {
    const requestId = c.get('requestId')
    const rpcMethod = c.get?.('rpcMethod')

    if (this.shouldIgnoreError(err)) return

    this.logger.error(
      `Req ${requestId} ${rpcMethod} error`,
      { reason: err.message },
      err,
    )

    const error = {
      code: INTERNAL_ERROR,
      message: err.message ?? 'Internal error',
      data: this.opts.stacktraces && err.stack?.split('\n'),
    }

    return getRpcErrorResponse(c as Context<RpcApiEnv>, error, 500)
  }

  private onNotFound(c: Context<RpcApiEnv>) {
    const message = `Route ${c.req.method}:${c.req.url} not found`
    this.logger.warn(message)
    const error = {
      code: INVALID_REQUEST,
      message,
    }
    return getRpcErrorResponse(c as Context<RpcApiEnv>, error, 404)
  }

  private onListening<T extends ServerType>(
    server: T,
    info: ReturnType<T['address']> | null,
    resolve: () => void,
    reject: (error: Error) => void,
  ) {
    if (!info) return reject(new Error('Failed to start RPC server'))
    const host = this.opts.address ?? '127.0.0.1'
    const port = this.opts.port

    if (!isLocalhostIP(host)) {
      this.logger.warn(
        'RPC server is exposed, ensure untrusted traffic cannot reach this API',
      )
    }
    this.isListening = true
    this.server = server

    const address = `http://${host}:${port}`
    this.logger.info('Started RPC server', { address })
    resolve()
  }
}
