import type { RLPxConnection } from '@ts-ethereum/p2p'
import { BIGINT_0, bytesToHex } from '@ts-ethereum/utils'
import debug from 'debug'
import { EventEmitter } from 'eventemitter3'
import type { Chain } from '../../blockchain'
import type { Config } from '../../config'
import {
  type AccountData,
  type GetAccountRangeOpts,
  type GetByteCodesOpts,
  type GetStorageRangesOpts,
  type GetTrieNodesOpts,
  SNAP_MESSAGES,
  SnapMessageCode,
  type StorageData,
} from '../../net/protocol/snap/definitions'
import type { SNAP } from '../../net/protocol/snap/snap'
import { registerDefaultSnapHandlers } from './handlers'
import { SnapHandlerRegistry } from './registry'
import type {
  RequestResolver,
  SnapHandlerContext,
  SnapProtocolMethods,
} from './types'

const log = debug('p2p:snap:handler')

/**
 * SNAP Protocol Handler
 *
 * Handles SNAP protocol messages through RLPxConnection socket.
 * Messages are sent/received via ECIES-encrypted RLPx connection.
 *
 * Unlike ETH protocol, SNAP has no STATUS handshake - it's a pure request/response protocol.
 */
export class SnapHandler extends EventEmitter implements SnapProtocolMethods {
  public readonly name = 'snap'
  public readonly config: Config
  public readonly chain: Chain
  private readonly rlpxConnection: RLPxConnection

  // Execution context for handlers that need additional context
  public context?: SnapHandlerContext

  // Request tracking for async request/response matching
  public readonly resolvers: Map<bigint, RequestResolver> = new Map()
  private readonly timeout = 8000 // 8 second timeout
  private nextReqId = BIGINT_0

  // Request deduplication: track in-flight requests to avoid duplicates
  private inFlightRequests: Map<string, Promise<any>> = new Map()

  // SNAP protocol instance from RLPxConnection
  private snapProtocol: SNAP | null = null
  private protocolOffset = 0
  private protocolVersion = 1 // snap/1

  // Handler registry for request/response routing
  public readonly registry: SnapHandlerRegistry = new SnapHandlerRegistry()

  constructor(options: {
    config: Config
    chain: Chain
    rlpxConnection: RLPxConnection
    context?: SnapHandlerContext
  }) {
    super()
    this.config = options.config
    this.chain = options.chain
    this.rlpxConnection = options.rlpxConnection
    this.context = options.context

    // Find SNAP protocol from RLPxConnection first
    this.setupProtocol()

    // Register all default handlers with protocol's registry
    registerDefaultSnapHandlers(this.registry)
  }

  /**
   * Setup SNAP protocol from RLPxConnection
   */
  private setupProtocol(): void {
    const protocols = this.rlpxConnection.getProtocols()
    const snapProtocol = protocols.find((p) => p.constructor.name === 'SNAP') as
      | SNAP
      | undefined

    if (!snapProtocol) {
      log('No SNAP protocol found in RLPxConnection')
      return
    }

    this.snapProtocol = snapProtocol

    // Get protocol version
    if ((snapProtocol as any)._version !== undefined) {
      this.protocolVersion = (snapProtocol as any)._version
    }

    // Find protocol offset
    const protocolsDesc = (this.rlpxConnection as any)._protocols as Array<{
      protocol: SNAP
      offset: number
      length: number
    }>
    const snapDesc = protocolsDesc.find(
      (p) => p.protocol.constructor.name === 'SNAP',
    )
    if (snapDesc) {
      this.protocolOffset = snapDesc.offset
    }

    // Listen to protocol events from devp2p SNAP protocol
    snapProtocol.events.on('message', (code: number, payload: any) => {
      this.handleMessage(code, payload)
    })

    log(
      'SNAP protocol setup complete: version=%d, offset=%d',
      this.protocolVersion,
      this.protocolOffset,
    )
  }

  /**
   * Handle incoming SNAP protocol messages
   */
  private handleMessage(code: number, payload: any): void {
    const snapCode = code as SnapMessageCode

    // Check if this is a response to a pending request
    if (
      snapCode === SnapMessageCode.ACCOUNT_RANGE ||
      snapCode === SnapMessageCode.STORAGE_RANGES ||
      snapCode === SnapMessageCode.BYTE_CODES ||
      snapCode === SnapMessageCode.TRIE_NODES
    ) {
      // Response messages - resolve the pending request
      const decoded = SNAP_MESSAGES[snapCode].decode(payload)
      const reqId = decoded.reqId

      const resolver = this.resolvers.get(reqId)
      if (resolver) {
        this.resolvers.delete(reqId)
        resolver.resolve(decoded)
        return
      }
      log(
        'Received response with no pending request: code=0x%02x, reqId=%d',
        snapCode,
        reqId,
      )
      return
    }

    // Request messages - route to handlers
    const handler = this.registry.getHandler(snapCode)
    if (handler) {
      const result = handler(this, payload)
      if (result instanceof Promise) {
        result.catch((error: Error) => {
          log('Error in handler for code 0x%02x: %s', snapCode, error.message)
        })
      }
    } else {
      // Emit as event for backward compatibility
      this.emit('message', snapCode, payload)
    }
  }

  /**
   * Send a SNAP protocol message
   */
  sendMessage(code: SnapMessageCode, data: any): void {
    if (!this.snapProtocol) {
      throw new Error('SNAP protocol not available')
    }

    this.snapProtocol.sendMessage(code, data)
  }

  /**
   * Check if SNAP protocol is available
   */
  isAvailable(): boolean {
    return this.snapProtocol !== null
  }

  /**
   * Get protocol version
   */
  getVersion(): number {
    return this.protocolVersion
  }

  /**
   * Request account range from peer
   */
  async getAccountRange(
    opts: Omit<GetAccountRangeOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; accounts: AccountData[]; proof: Uint8Array[] }> {
    if (!this.snapProtocol) {
      throw new Error('SNAP protocol not available')
    }

    // Generate request key for deduplication
    const requestKey = `account-range-${bytesToHex(opts.root).slice(0, 10)}-${bytesToHex(opts.origin).slice(0, 10)}`

    if (this.inFlightRequests.has(requestKey)) {
      log('Deduplicating GET_ACCOUNT_RANGE request')
      return this.inFlightRequests.get(requestKey)!
    }

    // Generate request ID
    const reqId = ++this.nextReqId

    // Encode request using protocol definitions
    const requestData = SNAP_MESSAGES[SnapMessageCode.GET_ACCOUNT_RANGE].encode(
      { ...opts, reqId },
      { value: this.nextReqId },
    )

    // Send request
    this.sendMessage(SnapMessageCode.GET_ACCOUNT_RANGE, requestData)

    log(
      'Sent GET_ACCOUNT_RANGE request: reqId=%d, root=%s, origin=%s',
      reqId,
      bytesToHex(opts.root).slice(0, 10),
      bytesToHex(opts.origin).slice(0, 10),
    )

    // Wait for response
    const promise = new Promise<{
      reqId: bigint
      accounts: AccountData[]
      proof: Uint8Array[]
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.resolvers.has(reqId)) {
          this.resolvers.delete(reqId)
          this.inFlightRequests.delete(requestKey)
          reject(
            new Error(`GET_ACCOUNT_RANGE request timed out (reqId=${reqId})`),
          )
        }
      }, this.timeout)

      this.resolvers.set(reqId, {
        resolve: (value: unknown) => {
          clearTimeout(timeout)
          this.inFlightRequests.delete(requestKey)
          resolve(
            value as {
              reqId: bigint
              accounts: AccountData[]
              proof: Uint8Array[]
            },
          )
        },
        reject: (err) => {
          clearTimeout(timeout)
          this.inFlightRequests.delete(requestKey)
          reject(err)
        },
        timeout,
      })
    })

    this.inFlightRequests.set(requestKey, promise)
    return promise
  }

  /**
   * Request storage ranges from peer
   */
  async getStorageRanges(
    opts: Omit<GetStorageRangesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; slots: StorageData[][]; proof: Uint8Array[] }> {
    if (!this.snapProtocol) {
      throw new Error('SNAP protocol not available')
    }

    // Generate request key for deduplication
    const accountsKey = opts.accounts
      .map((a) => bytesToHex(a).slice(0, 8))
      .join('-')
    const requestKey = `storage-ranges-${bytesToHex(opts.root).slice(0, 10)}-${accountsKey}`

    if (this.inFlightRequests.has(requestKey)) {
      log('Deduplicating GET_STORAGE_RANGES request')
      return this.inFlightRequests.get(requestKey)!
    }

    // Generate request ID
    const reqId = ++this.nextReqId

    // Encode request using protocol definitions
    const requestData = SNAP_MESSAGES[
      SnapMessageCode.GET_STORAGE_RANGES
    ].encode({ ...opts, reqId }, { value: this.nextReqId })

    // Send request
    this.sendMessage(SnapMessageCode.GET_STORAGE_RANGES, requestData)

    log(
      'Sent GET_STORAGE_RANGES request: reqId=%d, accounts=%d',
      reqId,
      opts.accounts.length,
    )

    // Wait for response
    const promise = new Promise<{
      reqId: bigint
      slots: StorageData[][]
      proof: Uint8Array[]
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.resolvers.has(reqId)) {
          this.resolvers.delete(reqId)
          this.inFlightRequests.delete(requestKey)
          reject(
            new Error(`GET_STORAGE_RANGES request timed out (reqId=${reqId})`),
          )
        }
      }, this.timeout)

      this.resolvers.set(reqId, {
        resolve: (value: unknown) => {
          clearTimeout(timeout)
          this.inFlightRequests.delete(requestKey)
          resolve(
            value as {
              reqId: bigint
              slots: StorageData[][]
              proof: Uint8Array[]
            },
          )
        },
        reject: (err) => {
          clearTimeout(timeout)
          this.inFlightRequests.delete(requestKey)
          reject(err)
        },
        timeout,
      })
    })

    this.inFlightRequests.set(requestKey, promise)
    return promise
  }

  /**
   * Request bytecodes from peer
   */
  async getByteCodes(
    opts: Omit<GetByteCodesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; codes: Uint8Array[] }> {
    if (!this.snapProtocol) {
      throw new Error('SNAP protocol not available')
    }

    // Generate request key for deduplication
    const hashesKey = opts.hashes
      .map((h) => bytesToHex(h).slice(0, 8))
      .join('-')
    const requestKey = `byte-codes-${hashesKey}`

    if (this.inFlightRequests.has(requestKey)) {
      log('Deduplicating GET_BYTE_CODES request')
      return this.inFlightRequests.get(requestKey)!
    }

    // Generate request ID
    const reqId = ++this.nextReqId

    // Encode request using protocol definitions
    const requestData = SNAP_MESSAGES[SnapMessageCode.GET_BYTE_CODES].encode(
      { ...opts, reqId },
      { value: this.nextReqId },
    )

    // Send request
    this.sendMessage(SnapMessageCode.GET_BYTE_CODES, requestData)

    log(
      'Sent GET_BYTE_CODES request: reqId=%d, hashes=%d',
      reqId,
      opts.hashes.length,
    )

    // Wait for response
    const promise = new Promise<{ reqId: bigint; codes: Uint8Array[] }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.resolvers.has(reqId)) {
            this.resolvers.delete(reqId)
            this.inFlightRequests.delete(requestKey)
            reject(
              new Error(`GET_BYTE_CODES request timed out (reqId=${reqId})`),
            )
          }
        }, this.timeout)

        this.resolvers.set(reqId, {
          resolve: (value: unknown) => {
            clearTimeout(timeout)
            this.inFlightRequests.delete(requestKey)
            resolve(value as { reqId: bigint; codes: Uint8Array[] })
          },
          reject: (err) => {
            clearTimeout(timeout)
            this.inFlightRequests.delete(requestKey)
            reject(err)
          },
          timeout,
        })
      },
    )

    this.inFlightRequests.set(requestKey, promise)
    return promise
  }

  /**
   * Request trie nodes from peer
   */
  async getTrieNodes(
    opts: Omit<GetTrieNodesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; nodes: Uint8Array[] }> {
    if (!this.snapProtocol) {
      throw new Error('SNAP protocol not available')
    }

    // Generate request key for deduplication
    const pathsKey = opts.paths
      .map((p) => p.map((x) => bytesToHex(x).slice(0, 4)).join('.'))
      .join('-')
    const requestKey = `trie-nodes-${bytesToHex(opts.root).slice(0, 10)}-${pathsKey.slice(0, 50)}`

    if (this.inFlightRequests.has(requestKey)) {
      log('Deduplicating GET_TRIE_NODES request')
      return this.inFlightRequests.get(requestKey)!
    }

    // Generate request ID
    const reqId = ++this.nextReqId

    // Encode request using protocol definitions
    const requestData = SNAP_MESSAGES[SnapMessageCode.GET_TRIE_NODES].encode(
      { ...opts, reqId },
      { value: this.nextReqId },
    )

    // Send request
    this.sendMessage(SnapMessageCode.GET_TRIE_NODES, requestData)

    log(
      'Sent GET_TRIE_NODES request: reqId=%d, paths=%d',
      reqId,
      opts.paths.length,
    )

    // Wait for response
    const promise = new Promise<{ reqId: bigint; nodes: Uint8Array[] }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.resolvers.has(reqId)) {
            this.resolvers.delete(reqId)
            this.inFlightRequests.delete(requestKey)
            reject(
              new Error(`GET_TRIE_NODES request timed out (reqId=${reqId})`),
            )
          }
        }, this.timeout)

        this.resolvers.set(reqId, {
          resolve: (value: unknown) => {
            clearTimeout(timeout)
            this.inFlightRequests.delete(requestKey)
            resolve(value as { reqId: bigint; nodes: Uint8Array[] })
          },
          reject: (err) => {
            clearTimeout(timeout)
            this.inFlightRequests.delete(requestKey)
            reject(err)
          },
          timeout,
        })
      },
    )

    this.inFlightRequests.set(requestKey, promise)
    return promise
  }
}
