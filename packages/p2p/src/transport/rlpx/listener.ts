/**
 * RLPx Listener - Handles inbound connections with ECIES handshake
 *
 * Based on the libp2p Listener interface pattern from transport/tcp/listener.ts
 */

import type {
  AbortOptions,
  CounterGroup,
  Listener,
  ListenerEvents,
  Logger,
  MetricGroup,
} from '@libp2p/interface'
import {
  AlreadyStartedError,
  InvalidParametersError,
  NotStartedError,
} from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import { multiaddr } from '@multiformats/multiaddr'
import { setMaxListeners, TypedEventEmitter } from 'main-event'
import net from 'node:net'
import { pEvent } from 'p-event'
// import type { NetConfig } from '../tcp/utils'
// import { getThinWaistAddresses, multiaddrToNetConfig } from '../tcp/utils'
import { getThinWaistAddresses, multiaddrToNetConfig, NetConfig } from '@ts-ethereum/utils'
import { RLPxConnection } from './connection'
import type {
  CloseServerOnMaxConnectionsOpts,
  RLPxCreateListenerOptions,
} from './types'

interface RLPxListenerContext extends RLPxCreateListenerOptions {
  inactivityTimeout?: number
  maxConnections?: number
  backlog?: number
  closeServerOnMaxConnections?: CloseServerOnMaxConnectionsOpts
}

interface RLPxListenerMetrics {
  status?: MetricGroup
  errors?: CounterGroup
  events?: CounterGroup
}

enum RLPxListenerStatusCode {
  /**
   * When server object is initialized but we don't know the listening address
   * yet or the server object is stopped manually
   */
  INACTIVE = 0,
  ACTIVE = 1,
  /**
   * During the connection limits
   */
  PAUSED = 2,
}

type Status =
  | { code: RLPxListenerStatusCode.INACTIVE }
  | {
      code: Exclude<RLPxListenerStatusCode, RLPxListenerStatusCode.INACTIVE>
      listeningAddr: Multiaddr
      netConfig: NetConfig
    }

/**
 * RLPx Listener Events - extends standard ListenerEvents with connection event
 */
export interface RLPxListenerEvents extends ListenerEvents {
  /**
   * Emitted when a new RLPx connection is established (after Hello exchange)
   */
  'rlpx:connection': CustomEvent<RLPxConnection>
}

/**
 * RLPx Listener - Accepts inbound connections and performs ECIES handshake
 */
export class RLPxListener
  extends TypedEventEmitter<RLPxListenerEvents>
  implements Listener
{
  private readonly server: net.Server
  private readonly connections = new Set<RLPxConnection>()
  private readonly sockets = new Set<net.Socket>()
  private status: Status = { code: RLPxListenerStatusCode.INACTIVE }
  private metrics: RLPxListenerMetrics
  private addr: string
  private actualListenPort: number = 0
  private readonly log: Logger
  private readonly shutdownController: AbortController
  private readonly context: RLPxListenerContext

  constructor(context: RLPxListenerContext) {
    super()

    this.context = context
    context.keepAlive = context.keepAlive ?? true
    context.noDelay = context.noDelay ?? true
    context.allowHalfOpen = context.allowHalfOpen ?? false
    this.actualListenPort = context.listenPort ?? 0
    this.shutdownController = new AbortController()
    setMaxListeners(Infinity, this.shutdownController.signal)

    this.log = context.logger.forComponent('rlpx:listener')
    this.addr = 'unknown'
    this.server = net.createServer(context, this.onSocket.bind(this))

    // Set max connections if specified
    if (context.maxConnections !== undefined) {
      this.server.maxConnections = context.maxConnections
    }

    // Validate closeServerOnMaxConnections options
    if (context.closeServerOnMaxConnections != null) {
      if (
        context.closeServerOnMaxConnections.closeAbove <
        context.closeServerOnMaxConnections.listenBelow
      ) {
        throw new InvalidParametersError('closeAbove must be >= listenBelow')
      }
    }

    // Register metrics
    context.metrics?.registerMetricGroup(
      'libp2p_rlpx_inbound_connections_total',
      {
        label: 'address',
        help: 'Current active connections in RLPx listener',
        calculate: () => ({
          [this.addr]: this.connections.size,
        }),
      },
    )

    this.metrics = {
      status: context.metrics?.registerMetricGroup(
        'libp2p_rlpx_listener_status_info',
        {
          label: 'address',
          help: 'Current status of the RLPx listener socket',
        },
      ),
      errors: context.metrics?.registerMetricGroup(
        'libp2p_rlpx_listener_errors_total',
        {
          label: 'address',
          help: 'Total count of RLPx listener errors by type',
        },
      ),
      events: context.metrics?.registerMetricGroup(
        'libp2p_rlpx_listener_events_total',
        {
          label: 'address',
          help: 'Total count of RLPx listener events by type',
        },
      ),
    }

    // Setup server events
    this.server
      .on('listening', () => {
        const address = this.server.address()

        if (address == null) {
          this.addr = 'unknown'
        } else if (typeof address === 'string') {
          this.addr = address
        } else {
          this.addr = `${address.address}:${address.port}`
          // Update the listen port for outgoing Hello messages
          // this.actualListenPort = address.port;
        }

        this.metrics.status?.update({
          [this.addr]: RLPxListenerStatusCode.ACTIVE,
        })

        this.safeDispatchEvent('listening')
      })
      .on('error', (err) => {
        this.metrics.errors?.increment({ [`${this.addr} listen_error`]: true })
        this.safeDispatchEvent('error', { detail: err })
      })
      .on('close', () => {
        this.metrics.status?.update({
          [this.addr]: this.status.code,
        })

        if (this.status.code !== RLPxListenerStatusCode.PAUSED) {
          this.safeDispatchEvent('close')
        }
      })
      .on('drop', () => {
        this.metrics.events?.increment({ [`${this.addr} drop`]: true })
      })
  }

  /**
   * Handle incoming socket connection
   */
  private onSocket(socket: net.Socket): void {
    this.metrics.events?.increment({ [`${this.addr} connection`]: true })

    if (this.status.code !== RLPxListenerStatusCode.ACTIVE) {
      socket.destroy()
      throw new NotStartedError('Server is not listening yet')
    }

    this.log(
      'new inbound socket from %s:%d',
      socket.remoteAddress,
      socket.remotePort,
    )

    this.sockets.add(socket)

    // Create RLPx connection in responder mode
    let connection: RLPxConnection
    try {
      connection = new RLPxConnection({
        socket,
        privateKey: this.context.privateKey,
        nodeId: this.context.nodeId,
        remoteId: null, // Unknown until auth
        clientId: this.context.clientId,
        capabilities: this.context.capabilities,
        common: this.context.common,
        timeout: this.context.timeout,
        listenPort: this.actualListenPort, // Use actual port from server
        remoteClientIdFilter: this.context.remoteClientIdFilter,
        useEIP8: true,
        direction: 'inbound',
        logger: this.context.logger,
        inactivityTimeout: this.context.inactivityTimeout,
      })
    } catch (err: any) {
      this.log.error('failed to create RLPx connection - %e', err)
      this.metrics.errors?.increment({
        [`${this.addr} inbound_create_connection`]: true,
      })
      socket.destroy()
      this.sockets.delete(socket)
      return
    }

    this.connections.add(connection)

    // Handle successful connection (Hello exchange complete)
    connection.once('connect', () => {
      this.log(
        'inbound connection established with %s:%d (id: %s)',
        socket.remoteAddress,
        socket.remotePort,
        connection.getId()?.slice(0, 8),
      )

      // Emit the connection event
      this.safeDispatchEvent('rlpx:connection', {
        detail: connection,
      })

      // Handle connection management for max connections
      if (
        this.context.closeServerOnMaxConnections != null &&
        this.connections.size >=
          this.context.closeServerOnMaxConnections.closeAbove
      ) {
        this.log(
          'pausing incoming connections as limit is exceeded - %d/%d',
          this.connections.size,
          this.context.closeServerOnMaxConnections.closeAbove,
        )
        this.pause()
      }
    })

    // Handle connection close
    connection.once('close', () => {
      this.connections.delete(connection)
      this.sockets.delete(socket)

      if (
        this.context.closeServerOnMaxConnections != null &&
        this.connections.size <
          this.context.closeServerOnMaxConnections.listenBelow
      ) {
        this.resume().catch((err) => {
          this.log.error('error attempting to resume server - %e', err)
          this.context.closeServerOnMaxConnections?.onListenError?.(
            err as Error,
          )
        })
      }
    })

    // Handle connection error (ignore common P2P errors)
    connection.once('error', (err) => {
      this.log.error('inbound connection error - %e', err)
      this.metrics.errors?.increment({
        [`${this.addr} inbound_connection_error`]: true,
      })
    })

    // Handle socket close without successful connection
    socket.once('close', () => {
      this.sockets.delete(socket)
      if (!connection.isConnected()) {
        this.connections.delete(connection)
      }
    })
  }

  /**
   * Get addresses this listener is listening on
   */
  getAddrs(): Multiaddr[] {
    if (this.status.code === RLPxListenerStatusCode.INACTIVE) {
      return []
    }

    const address = this.server.address()

    if (address == null) {
      return []
    }

    if (typeof address === 'string') {
      return [multiaddr(`/unix/${encodeURIComponent(address)}`)]
    }

    return getThinWaistAddresses(this.status.listeningAddr, address.port)
  }

  /**
   * Update announce addresses (no-op for RLPx)
   */
  updateAnnounceAddrs(): void {}

  /**
   * Start listening on the given multiaddr
   */
  async listen(ma: Multiaddr): Promise<void> {
    if (
      this.status.code === RLPxListenerStatusCode.ACTIVE ||
      this.status.code === RLPxListenerStatusCode.PAUSED
    ) {
      throw new AlreadyStartedError('server is already listening')
    }

    try {
      this.status = {
        code: RLPxListenerStatusCode.ACTIVE,
        listeningAddr: ma,
        netConfig: multiaddrToNetConfig(ma, this.context),
      }

      await this.resume()
    } catch (err) {
      this.status = { code: RLPxListenerStatusCode.INACTIVE }
      throw err
    }
  }

  /**
   * Close the listener
   */
  async close(options?: AbortOptions): Promise<void> {
    const events: Array<Promise<void>> = []

    if (this.server.listening) {
      events.push(pEvent(this.server, 'close', options))
    }

    // Shut down permanently
    this.pause(true)

    // Stop any in-progress connection upgrades
    // this.shutdownController.abort();

    // Close all connections
    for (const connection of this.connections) {
      connection.close()
    }

    // Destroy all sockets
    for (const socket of this.sockets) {
      if (socket.readable) {
        events.push(pEvent(socket, 'close', options))
        socket.destroy()
      }
    }

    await Promise.all(events)
  }

  /**
   * Resume listening
   */
  private async resume(): Promise<void> {
    if (
      this.server.listening ||
      this.status.code === RLPxListenerStatusCode.INACTIVE
    ) {
      return
    }

    const netConfig = this.status.netConfig

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(netConfig, resolve)
    })

    this.status = { ...this.status, code: RLPxListenerStatusCode.ACTIVE }
    this.log('listening on %s', this.server.address())
  }

  /**
   * Pause listening
   */
  private pause(permanent: boolean = false): void {
    if (
      !this.server.listening &&
      this.status.code === RLPxListenerStatusCode.PAUSED &&
      permanent
    ) {
      this.status = { code: RLPxListenerStatusCode.INACTIVE }
      return
    }

    if (
      !this.server.listening ||
      this.status.code !== RLPxListenerStatusCode.ACTIVE
    ) {
      return
    }

    this.log(
      '%s server on %s',
      permanent ? 'closing' : 'pausing',
      this.server.address(),
    )

    this.status = permanent
      ? { code: RLPxListenerStatusCode.INACTIVE }
      : { ...this.status, code: RLPxListenerStatusCode.PAUSED }

    this.server.close()
  }

  /**
   * Get active connections
   */
  getConnections(): RLPxConnection[] {
    return Array.from(this.connections)
  }
}
