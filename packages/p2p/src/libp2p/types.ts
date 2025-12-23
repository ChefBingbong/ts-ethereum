/**
 * Types and interfaces for the simplified P2P Node
 * Based on libp2p interfaces but tailored for RLPx transport
 */

import type { Listener, Transport } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { TypedEventTarget } from 'main-event'
import type { RLPxConnection } from '../transport/rlpx/connection'

// ============================================================================
// Core Types
// ============================================================================

/**
 * PeerId is a 64-byte Uint8Array (secp256k1 public key without 0x04 prefix)
 */
export type PeerId = Uint8Array

/**
 * Node status lifecycle
 */
export type P2PNodeStatus = 'starting' | 'started' | 'stopping' | 'stopped'

/**
 * Connection direction
 */
export type ConnectionDirection = 'inbound' | 'outbound'

/**
 * Connection status
 */
export type ConnectionStatus = 'open' | 'closing' | 'closed'

// ============================================================================
// Abort Options
// ============================================================================

export interface AbortOptions {
  signal?: AbortSignal
}

// ============================================================================
// Stream Handler Types
// ============================================================================

/**
 * Handler function for incoming protocol streams
 */
export interface StreamHandler {
  (data: { stream: any; connection: Connection }): void | Promise<void>
}

/**
 * Options for registering a stream handler
 */
export interface StreamHandlerOptions extends AbortOptions {
  /**
   * Max incoming streams per connection for this protocol
   * @default 32
   */
  maxInboundStreams?: number

  /**
   * Max outgoing streams per connection for this protocol
   * @default 64
   */
  maxOutboundStreams?: number

  /**
   * Allow running on connections with transfer limits
   * @default false
   */
  runOnLimitedConnection?: boolean

  /**
   * If true, replace existing handler for this protocol
   */
  force?: boolean
}

/**
 * Registered stream handler with its options
 */
export interface StreamHandlerRecord {
  handler: StreamHandler
  options: StreamHandlerOptions
}

// ============================================================================
// Topology Types
// ============================================================================

/**
 * A topology filter prevents duplicate notifications for the same peer
 */
export interface TopologyFilter {
  has(peerId: PeerId): boolean
  add(peerId: PeerId): void
  remove(peerId: PeerId): void
}

/**
 * A topology receives notifications when peers supporting a protocol connect/disconnect
 */
export interface Topology {
  /**
   * Optional filter to prevent duplicate notifications
   */
  filter?: TopologyFilter

  /**
   * If true, notify on limited connections too
   * @default false
   */
  notifyOnLimitedConnection?: boolean

  /**
   * Called when a peer supporting the registered protocol connects
   */
  onConnect?(peerId: PeerId, connection: Connection): void | Promise<void>

  /**
   * Called when the last connection to a peer supporting the protocol closes
   */
  onDisconnect?(peerId: PeerId): void | Promise<void>
}

// ============================================================================
// Peer Types
// ============================================================================

/**
 * Basic peer info
 */
export interface PeerInfo {
  id: PeerId
  multiaddrs: Multiaddr[]
}

/**
 * Peer data stored in peer store
 */
export interface Peer {
  id: PeerId
  addresses: Array<{ multiaddr: Multiaddr }>
  protocols: string[]
  metadata: Map<string, Uint8Array>
  tags: Map<string, { value: number }>
}

/**
 * Event detail for peer updates
 */
export interface PeerUpdate {
  peer: Peer
  previous?: Peer
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Timeline of connection events
 */
export interface ConnectionTimeline {
  open: number
  close?: number
}

/**
 * Connection interface - abstraction over RLPxConnection
 */
export interface Connection {
  /**
   * Unique identifier for this connection
   */
  id: string

  /**
   * Remote peer's address
   */
  remoteAddr: Multiaddr

  /**
   * Remote peer's ID
   */
  remotePeer: PeerId

  /**
   * Connection direction
   */
  direction: ConnectionDirection

  /**
   * Current status
   */
  status: ConnectionStatus

  /**
   * Connection lifecycle timeline
   */
  timeline: ConnectionTimeline

  /**
   * Close the connection gracefully
   */
  close(options?: AbortOptions): Promise<void>

  /**
   * Abort the connection immediately
   */
  abort(err: Error): void
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the P2P Node
 * Uses CustomEvent with detail property like libp2p
 */
export interface P2PNodeEvents {
  /**
   * New peer discovered (future: from DPT)
   */
  'peer:discovery': CustomEvent<PeerInfo>

  /**
   * First connection to a peer established
   */
  'peer:connect': CustomEvent<PeerId>

  /**
   * Last connection to a peer closed
   */
  'peer:disconnect': CustomEvent<PeerId>

  /**
   * Peer protocols or metadata updated
   */
  'peer:update': CustomEvent<PeerUpdate>

  /**
   * Peer identified (after protocol handshake)
   */
  'peer:identify': CustomEvent<IdentifyResult>

  /**
   * New connection opened
   */
  'connection:open': CustomEvent<Connection>

  /**
   * Connection closed
   */
  'connection:close': CustomEvent<Connection>

  /**
   * Transport started listening
   */
  'transport:listening': CustomEvent<Listener>

  /**
   * Transport stopped listening
   */
  'transport:close': CustomEvent<Listener>

  /**
   * Node started
   */
  start: CustomEvent<P2PNode>

  /**
   * Node stopped
   */
  stop: CustomEvent<P2PNode>
}

/**
 * Result of peer identification
 */
export interface IdentifyResult {
  peerId: PeerId
  protocols: string[]
  connection: Connection
}

// ============================================================================
// Component Interfaces
// ============================================================================

/**
 * Logger interface
 */
export interface Logger {
  (formatter: any, ...args: any[]): void
  error(formatter: any, ...args: any[]): void
  trace(formatter: any, ...args: any[]): void
  enabled: boolean
}

/**
 * Component logger factory
 */
export interface ComponentLogger {
  forComponent(name: string): Logger
}

/**
 * Transport manager dial options
 */
export interface TransportManagerDialOptions extends AbortOptions {
  /**
   * Remote peer ID (required for RLPx)
   */
  remoteId?: Uint8Array
}

/**
 * Address manager interface
 */
export interface AddressManager {
  getListenAddrs(): Multiaddr[]
  getAddresses(): Multiaddr[]
}

/**
 * Transport manager interface
 */
export interface TransportManager {
  add(transport: Transport): void
  dial(
    ma: Multiaddr,
    options?: TransportManagerDialOptions,
  ): Promise<RLPxConnection>
  listen(addrs: Multiaddr[]): Promise<void>
  getAddrs(): Multiaddr[]
  getTransports(): Transport[]
  getListeners(): Listener[]
  start(): void
  stop(): Promise<void>
}

/**
 * Connection manager interface
 */
export interface ConnectionManager {
  openConnection(
    peer: Multiaddr,
    options?: TransportManagerDialOptions,
  ): Promise<Connection>
  getConnections(peerId?: PeerId): Connection[]
  closeConnections(peerId: PeerId, options?: AbortOptions): Promise<void>
  acceptIncomingConnection(connection: RLPxConnection): boolean
  afterUpgradeInbound(): void
  getMaxConnections(): number
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Registrar interface
 */
export interface Registrar {
  getProtocols(): string[]
  getHandler(protocol: string): StreamHandlerRecord
  getTopologies(protocol: string): Topology[]
  handle(
    protocol: string,
    handler: StreamHandler,
    opts?: StreamHandlerOptions,
  ): void
  unhandle(protocols: string | string[]): void
  register(protocol: string, topology: Topology): string
  unregister(id: string): void
}

// ============================================================================
// P2P Node Configuration
// ============================================================================

/**
 * Address configuration
 */
export interface AddressConfig {
  /**
   * Multiaddrs to listen on
   */
  listen?: string[]

  /**
   * Multiaddrs to announce (overrides listen addrs)
   */
  announce?: string[]
}

/**
 * Transport factory function
 */
export type TransportFactory<T extends Transport = Transport> = (
  components: P2PNodeComponents,
) => T

/**
 * Peer discovery module interface (for future DPT integration)
 */
export interface PeerDiscovery extends TypedEventTarget<PeerDiscoveryEvents> {
  readonly [Symbol.toStringTag]: string
  start(): void | Promise<void>
  stop(): void | Promise<void>
}

export interface PeerDiscoveryEvents {
  peer: CustomEvent<PeerInfo>
}

/**
 * Symbol to identify peer discovery modules
 */
export const peerDiscoverySymbol = Symbol.for('@libp2p/peeriscovery')

/**
 * P2P Node initialization options
 */
export interface P2PNodeInit {
  /**
   * Node's private key (required)
   */
  privateKey: Uint8Array

  /**
   * Address configuration
   */
  addresses?: AddressConfig

  /**
   * Transport factory functions
   */
  transports?: TransportFactory[]

  /**
   * Maximum number of connections
   * @default 100
   */
  maxConnections?: number

  /**
   * Dial timeout in milliseconds
   * @default 10000
   */
  dialTimeout?: number

  /**
   * Custom logger
   */
  logger?: ComponentLogger

  /**
   * Peer discovery modules (future: for DPT)
   */
  peerDiscovery?: Array<(components: P2PNodeComponents) => PeerDiscovery>
}

/**
 * Internal components passed to sub-modules
 */
export interface P2PNodeComponents {
  peerId: PeerId
  privateKey: Uint8Array
  logger: ComponentLogger
  events: TypedEventTarget<P2PNodeEvents>
  addressManager: AddressManager
  transportManager: TransportManager
  connectionManager: ConnectionManager
  registrar: Registrar
}

// ============================================================================
// P2P Node Interface
// ============================================================================

/**
 * The main P2P Node interface
 */
export interface P2PNode extends TypedEventTarget<P2PNodeEvents> {
  /**
   * The node's peer ID
   */
  peerId: PeerId

  /**
   * Current status
   */
  status: P2PNodeStatus

  /**
   * Start the node
   */
  start(): Promise<void>

  /**
   * Stop the node
   */
  stop(): Promise<void>

  /**
   * Dial a peer
   */
  dial(
    ma: Multiaddr,
    options?: TransportManagerDialOptions,
  ): Promise<Connection>

  /**
   * Register a protocol handler
   */
  handle(
    protocol: string,
    handler: StreamHandler,
    options?: StreamHandlerOptions,
  ): void

  /**
   * Unregister protocol handler(s)
   */
  unhandle(protocols: string | string[]): void

  /**
   * Register a topology for protocol notifications
   */
  register(protocol: string, topology: Topology): string

  /**
   * Unregister a topology
   */
  unregister(id: string): void

  /**
   * Get all connections, optionally filtered by peer
   */
  getConnections(peerId?: PeerId): Connection[]

  /**
   * Get all connected peer IDs
   */
  getPeers(): PeerId[]

  /**
   * Get multiaddrs the node is listening on
   */
  getMultiaddrs(): Multiaddr[]

  /**
   * Get registered protocols
   */
  getProtocols(): string[]

  /**
   * Close all connections to a peer
   */
  hangUp(peer: PeerId, options?: AbortOptions): Promise<void>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Helper to convert PeerId to hex string for Map keys
 */
export function peerIdToString(peerId: PeerId): string {
  return Buffer.from(peerId).toString('hex')
}

/**
 * Compare two PeerIds for equality
 */
export function peerIdEquals(a: PeerId, b: PeerId): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MAX_INBOUND_STREAMS = 32
export const DEFAULT_MAX_OUTBOUND_STREAMS = 64
export const DEFAULT_MAX_CONNECTIONS = 100
export const DEFAULT_DIAL_TIMEOUT = 10000
