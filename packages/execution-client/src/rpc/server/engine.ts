import type { Context, Next } from 'hono'
import { requestId } from 'hono/request-id'

import { jwt } from '../../ext/jwt-simple'
import type { ExecutionNode } from '../../node/index'
import { getRpcErrorResponse } from '../helpers'
import { createEngineRpcMethods } from '../modules/engine/engine'
import type { RpcMethodFn } from '../types'
import { type RpcApiEnv, rpcRequestSchema } from '../types'
import { createRpcHandler, rpcValidator } from '../validation'
import {
  RpcServerBase,
  type RpcServerModules,
  type RpcServerOpts,
} from './base'

export const ENGINE_API_DEFAULT_PORT = 8551

const JWT_CLOCK_SKEW_ALLOWANCE = 60

export type EngineRpcServerOpts = RpcServerOpts & {
  enabled: boolean
  jwtSecret?: string | Uint8Array
  jwtAuth?: boolean
  debug?: boolean
}

export const engineRpcServerOpts: EngineRpcServerOpts = {
  enabled: false,
  port: ENGINE_API_DEFAULT_PORT,
  address: '127.0.0.1', // Localhost only by default for security
  cors: undefined,
  bodyLimit: 10 * 1024 * 1024, // 10MB
  stacktraces: false,
  jwtAuth: true,
  debug: false,
}

export type EngineRpcServerModules = RpcServerModules & {
  node: ExecutionNode
}

/**
 * Dedicated RPC server for Engine API methods.
 * Implements JWT authentication as required by the Engine API specification.
 */
export class EngineRpcServer extends RpcServerBase {
  readonly modules: EngineRpcServerModules
  private jwtSecret?: string
  private jwtAuthEnabled: boolean

  constructor(
    optsArg: Partial<EngineRpcServerOpts>,
    modules: EngineRpcServerModules,
  ) {
    const opts = { ...engineRpcServerOpts, ...optsArg }
    super(opts, modules)
    this.modules = modules
    this.jwtAuthEnabled = opts.jwtAuth !== false

    // Process JWT secret
    if (opts.jwtSecret) {
      this.jwtSecret = normalizeJwtSecret(opts.jwtSecret)
    }

    this.registerRoutes(opts.debug ?? false)
  }

  private registerRoutes(debug: boolean): void {
    // Create only engine_* method handlers
    const engineMethods = createEngineRpcMethods(this.modules.node)
    const methods: Record<string, RpcMethodFn> = engineMethods

    const rpcHandlers = createRpcHandler(methods, { debug })

    // Request ID middleware
    this.app.use('*', requestId({ generator: () => Date.now().toString() }))

    // JWT authentication middleware (if enabled)
    if (this.jwtAuthEnabled) {
      this.app.use('*', this.jwtAuthMiddleware.bind(this))
    }

    // Register RPC handler for engine methods
    this.app.post('/', rpcValidator(rpcRequestSchema), rpcHandlers as any)
  }

  /**
   * JWT authentication middleware.
   * Validates the Bearer token in the Authorization header.
   *
   * Per Engine API spec:
   * - Token must be in Authorization header as "Bearer <token>"
   * - Token must contain an "iat" claim within 60 seconds of current time
   */
  private async jwtAuthMiddleware(c: Context<RpcApiEnv>, next: Next) {
    // If no secret configured, reject all requests
    if (!this.jwtSecret) {
      this.logger.error(
        'Engine API JWT authentication enabled but no secret configured',
      )
      return getRpcErrorResponse(
        c,
        {
          code: -32003,
          message: 'JWT secret not configured',
        },
        500,
      )
    }

    const authHeader = c.req.header('Authorization')

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        'Engine API request missing or invalid Authorization header',
      )
      return getRpcErrorResponse(
        c,
        {
          code: -32003,
          message: 'Missing or invalid Authorization header',
        },
        401,
      )
    }

    const token = authHeader.trim().split(' ')[1]

    try {
      // Decode and verify JWT
      const payload = jwt.decode(token, this.jwtSecret as never)

      // Validate "iat" (issued at) claim
      if (payload.iat === undefined) {
        throw new Error('JWT missing "iat" claim')
      }

      const now = Math.floor(Date.now() / 1000)
      const iat = Number(payload.iat)

      // Check if token is within allowed time window
      if (Math.abs(now - iat) > JWT_CLOCK_SKEW_ALLOWANCE) {
        throw new Error(
          `JWT "iat" claim is outside of allowed range (${JWT_CLOCK_SKEW_ALLOWANCE}s)`,
        )
      }

      // Token is valid, proceed to handler
      return next()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JWT'
      this.logger.warn(`Engine API JWT validation failed: ${message}`)
      return getRpcErrorResponse(
        c,
        {
          code: -32003,
          message: `JWT authentication failed: ${message}`,
        },
        401,
      )
    }
  }

  async listen(): Promise<void> {
    if (!this.jwtAuthEnabled) {
      this.logger.warn(
        'Engine API JWT authentication is DISABLED - this is insecure!',
      )
    }
    await super.listen()
    this.logger.info(
      `Engine API server started on port ${this.opts.port}` +
        (this.jwtAuthEnabled ? ' (JWT auth enabled)' : ' (JWT auth DISABLED)'),
    )
  }

  /**
   * Get the JWT secret (for sharing with consensus client)
   */
  getJwtSecret(): string | undefined {
    return this.jwtSecret
  }
}

/**
 * Normalize JWT secret to a hex string.
 * Accepts either a hex string or Uint8Array.
 */
function normalizeJwtSecret(secret: string | Uint8Array): string {
  if (typeof secret === 'string') {
    // Remove 0x prefix if present
    return secret.startsWith('0x') ? secret.slice(2) : secret
  }
  // Convert Uint8Array to hex string
  return Buffer.from(secret).toString('hex')
}

/**
 * Generate a random JWT secret (32 bytes = 256 bits).
 * Returns the secret as a hex string.
 */
export function generateJwtSecret(): string {
  const crypto = require('node:crypto')
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a JWT token for Engine API authentication.
 * Per spec, the token should contain an "iat" claim.
 */
export function createEngineJwt(secret: string): string {
  const payload = {
    iat: Math.floor(Date.now() / 1000),
  }
  return jwt.encode(payload, secret, 'HS256')
}
