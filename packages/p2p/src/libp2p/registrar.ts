/**
 * Registrar - Protocol handler and topology management
 * Based on libp2p/src/registrar.ts
 *
 * Responsible for:
 * - Registering/unregistering protocol handlers
 * - Managing topologies for protocol-level peer notifications
 * - Notifying topologies when peers connect/disconnect
 */

import type { TypedEventTarget } from 'main-event'
import type {
  ComponentLogger,
  Connection,
  IdentifyResult,
  Logger,
  P2PNodeEvents,
  Peer,
  PeerId,
  PeerUpdate,
  Registrar as RegistrarInterface,
  StreamHandler,
  StreamHandlerOptions,
  StreamHandlerRecord,
  Topology,
} from './types'
import {
  DEFAULT_MAX_INBOUND_STREAMS,
  DEFAULT_MAX_OUTBOUND_STREAMS,
  peerIdToString,
} from './types'

/**
 * Error thrown when a protocol handler already exists
 */
export class DuplicateProtocolHandlerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateProtocolHandlerError'
  }
}

/**
 * Error thrown when no handler is registered for a protocol
 */
export class UnhandledProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnhandledProtocolError'
  }
}

/**
 * Components required by the Registrar
 */
export interface RegistrarComponents {
  peerId: PeerId
  events: TypedEventTarget<P2PNodeEvents>
  logger: ComponentLogger
}

/**
 * Simple in-memory peer store for tracking peer protocols
 */
class SimplePeerStore {
  private readonly peers: Map<string, Peer> = new Map()

  get(peerId: PeerId): Peer | undefined {
    return this.peers.get(peerIdToString(peerId))
  }

  set(peerId: PeerId, peer: Peer): void {
    this.peers.set(peerIdToString(peerId), peer)
  }

  delete(peerId: PeerId): void {
    this.peers.delete(peerIdToString(peerId))
  }

  has(peerId: PeerId): boolean {
    return this.peers.has(peerIdToString(peerId))
  }
}

/**
 * Registrar implementation
 * Manages protocol handlers and topologies for peer notifications
 */
export class Registrar implements RegistrarInterface {
  private readonly log: Logger
  private readonly topologies: Map<string, Map<string, Topology>>
  private readonly handlers: Map<string, StreamHandlerRecord>
  private readonly components: RegistrarComponents
  private readonly peerStore: SimplePeerStore

  readonly [Symbol.toStringTag] = '@p2p/registrar'

  constructor(components: RegistrarComponents) {
    this.components = components
    this.log = components.logger.forComponent('p2p:registrar')
    this.topologies = new Map()
    this.handlers = new Map()
    this.peerStore = new SimplePeerStore()

    // Bind event handlers
    this._onDisconnect = this._onDisconnect.bind(this)
    this._onPeerUpdate = this._onPeerUpdate.bind(this)
    this._onPeerIdentify = this._onPeerIdentify.bind(this)

    // Subscribe to events
    this.components.events.addEventListener(
      'peer:disconnect',
      this._onDisconnect as any,
    )
    this.components.events.addEventListener(
      'peer:update',
      this._onPeerUpdate as any,
    )
    this.components.events.addEventListener(
      'peer:identify',
      this._onPeerIdentify as any,
    )
  }

  /**
   * Get all registered protocol names
   */
  getProtocols(): string[] {
    return Array.from(new Set<string>([...this.handlers.keys()])).sort()
  }

  /**
   * Get the handler for a specific protocol
   * @throws UnhandledProtocolError if no handler registered
   */
  getHandler(protocol: string): StreamHandlerRecord {
    const handler = this.handlers.get(protocol)

    if (handler == null) {
      throw new UnhandledProtocolError(
        `No handler registered for protocol ${protocol}`,
      )
    }

    return handler
  }

  /**
   * Check if a handler exists for a protocol
   */
  hasHandler(protocol: string): boolean {
    return this.handlers.has(protocol)
  }

  /**
   * Get all topologies registered for a protocol
   */
  getTopologies(protocol: string): Topology[] {
    const topologies = this.topologies.get(protocol)

    if (topologies == null) {
      return []
    }

    return [...topologies.values()]
  }

  /**
   * Register a handler for a protocol
   * @throws DuplicateProtocolHandlerError if handler already exists and force !== true
   */
  handle(
    protocol: string,
    handler: StreamHandler,
    opts?: StreamHandlerOptions,
  ): void {
    if (this.handlers.has(protocol) && opts?.force !== true) {
      throw new DuplicateProtocolHandlerError(
        `Handler already registered for protocol ${protocol}`,
      )
    }

    this.log('registering handler for protocol %s', protocol)

    this.handlers.set(protocol, {
      handler,
      options: {
        maxInboundStreams: DEFAULT_MAX_INBOUND_STREAMS,
        maxOutboundStreams: DEFAULT_MAX_OUTBOUND_STREAMS,
        ...opts,
      },
    })
  }

  /**
   * Remove handler(s) for protocol(s)
   */
  unhandle(protocols: string | string[]): void {
    const protocolList = Array.isArray(protocols) ? protocols : [protocols]

    for (const protocol of protocolList) {
      this.log('unregistering handler for protocol %s', protocol)
      this.handlers.delete(protocol)
    }
  }

  /**
   * Register a topology to receive peer connect/disconnect notifications
   * @returns Unique topology ID for later unregistration
   */
  register(protocol: string, topology: Topology): string {
    if (topology == null) {
      throw new Error('invalid topology')
    }

    // Generate unique ID
    const id = `${(Math.random() * 1e9).toString(36)}${Date.now()}`

    let topologies = this.topologies.get(protocol)

    if (topologies == null) {
      topologies = new Map<string, Topology>()
      this.topologies.set(protocol, topologies)
    }

    topologies.set(id, topology)

    this.log('registered topology %s for protocol %s', id, protocol)

    return id
  }

  /**
   * Unregister a topology
   */
  unregister(id: string): void {
    for (const [protocol, topologies] of this.topologies.entries()) {
      if (topologies.has(id)) {
        topologies.delete(id)
        this.log('unregistered topology %s from protocol %s', id, protocol)

        if (topologies.size === 0) {
          this.topologies.delete(protocol)
        }
      }
    }
  }

  /**
   * Handle peer disconnect event
   * Notify all relevant topologies that peer has disconnected
   */
  private async _onDisconnect(evt: CustomEvent<PeerId>): Promise<void> {
    const remotePeer = evt.detail

    this.log('peer disconnected: %s', peerIdToString(remotePeer).slice(0, 16))

    try {
      const peer = this.peerStore.get(remotePeer)

      if (peer == null) {
        // Peer was never identified, nothing to notify
        return
      }

      for (const protocol of peer.protocols) {
        const topologies = this.topologies.get(protocol)

        if (topologies == null) {
          // No topologies interested in this protocol
          continue
        }

        await Promise.all(
          [...topologies.values()].map(async (topology) => {
            if (topology.filter?.has(remotePeer) === false) {
              return
            }

            topology.filter?.remove(remotePeer)
            await topology.onDisconnect?.(remotePeer)
          }),
        )
      }

      // Remove peer from store after notifying topologies
      this.peerStore.delete(remotePeer)
    } catch (err: any) {
      this.log.error(
        'could not inform topologies of disconnecting peer %s - %s',
        peerIdToString(remotePeer).slice(0, 16),
        err.message,
      )
    }
  }

  /**
   * Handle peer update event
   * Notify topologies if peer removed protocols they're interested in
   */
  private async _onPeerUpdate(evt: CustomEvent<PeerUpdate>): Promise<void> {
    const { peer, previous } = evt.detail

    // Find protocols that were removed
    const removed = (previous?.protocols ?? []).filter(
      (protocol) => !peer.protocols.includes(protocol),
    )

    try {
      for (const protocol of removed) {
        const topologies = this.topologies.get(protocol)

        if (topologies == null) {
          continue
        }

        await Promise.all(
          [...topologies.values()].map(async (topology) => {
            if (topology.filter?.has(peer.id) === false) {
              return
            }

            topology.filter?.remove(peer.id)
            await topology.onDisconnect?.(peer.id)
          }),
        )
      }

      // Update peer in store
      this.peerStore.set(peer.id, peer)
    } catch (err: any) {
      this.log.error(
        'could not inform topologies of updated peer %s - %s',
        peerIdToString(peer.id).slice(0, 16),
        err.message,
      )
    }
  }

  /**
   * Handle peer identify event
   * After peer identification, notify topologies of peer's supported protocols
   */
  private async _onPeerIdentify(
    evt: CustomEvent<IdentifyResult>,
  ): Promise<void> {
    const { protocols, connection, peerId } = evt.detail

    this.log(
      'peer identified: %s with protocols: %s',
      peerIdToString(peerId).slice(0, 16),
      protocols.join(', '),
    )

    // Handle case where connection might be undefined
    if (connection == null) {
      this.log(
        'peer:identify event missing connection for peer %s, skipping topology notification',
        peerIdToString(peerId).slice(0, 16),
      )
      return
    }

    // Store peer info
    const peer: Peer = {
      id: peerId,
      addresses: connection.remoteAddr
        ? [{ multiaddr: connection.remoteAddr }]
        : [],
      protocols,
      metadata: new Map(),
      tags: new Map(),
    }
    this.peerStore.set(peerId, peer)

    try {
      for (const protocol of protocols) {
        const topologies = this.topologies.get(protocol)

        if (topologies == null) {
          // No topologies interested in this protocol
          continue
        }

        await Promise.all(
          [...topologies.values()].map(async (topology) => {
            // Skip if connection has limits and topology doesn't want limited connections
            const connectionAny = connection as any
            if (
              connectionAny.limits != null &&
              topology.notifyOnLimitedConnection !== true
            ) {
              return
            }

            // Skip if already notified for this peer
            if (topology.filter?.has(peerId) === true) {
              return
            }

            topology.filter?.add(peerId)
            await topology.onConnect?.(peerId, connection)
          }),
        )
      }
    } catch (err: any) {
      this.log.error(
        'could not inform topologies of identified peer %s - %s',
        peerIdToString(peerId).slice(0, 16),
        err.message,
      )
    }
  }

  /**
   * Manually notify topologies of a new connection
   * Used when peer is already identified (e.g., RLPx Hello)
   */
  async notifyConnection(
    peerId: PeerId,
    connection: Connection,
    protocols: string[],
  ): Promise<void> {
    // Store peer info
    const peer: Peer = {
      id: peerId,
      addresses: [{ multiaddr: connection.remoteAddr }],
      protocols,
      metadata: new Map(),
      tags: new Map(),
    }
    this.peerStore.set(peerId, peer)

    for (const protocol of protocols) {
      const topologies = this.topologies.get(protocol)

      if (topologies == null) {
        continue
      }

      await Promise.all(
        [...topologies.values()].map(async (topology) => {
          if (topology.filter?.has(peerId) === true) {
            return
          }

          topology.filter?.add(peerId)
          await topology.onConnect?.(peerId, connection)
        }),
      )
    }
  }

  /**
   * Clean up event listeners
   */
  stop(): void {
    this.components.events.removeEventListener(
      'peer:disconnect',
        this._onDisconnect as any,
    )
    this.components.events.removeEventListener(
      'peer:update',
      this._onPeerUpdate as any,
    )
    this.components.events.removeEventListener(
      'peer:identify',
      this._onPeerIdentify as any,
    )
  }
}

/**
 * Create a new Registrar instance
 */
export function createRegistrar(components: RegistrarComponents): Registrar {
  return new Registrar(components)
}
