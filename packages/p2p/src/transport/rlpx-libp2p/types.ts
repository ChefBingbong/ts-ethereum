/**
 * Types and interfaces for the RLPx libp2p-style transport
 */

import type { Socket } from 'node:net'
import type {
  ComponentLogger,
  CounterGroup,
  DialTransportOptions,
  Metrics,
  OutboundConnectionUpgradeEvents,
} from '@libp2p/interface'
import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { ProgressEvent } from 'progress-events'
// import type { Capabilities } from '../../../client/net/dpt-1/types'
// import type { Protocol } from '../../../client/net/protocol/protocol'

/**
 * Hello message structure received from remote peer
 */
export interface HelloMessage {
  protocolVersion: number
  clientId: string
  capabilities: any[]
  port: number
  id: Uint8Array
}

/**
 * Protocol descriptor for negotiated subprotocols
 */
export interface ProtocolDescriptor {
  protocol: any
  offset: number
  length?: number
}

/**
 * RLPx connection state machine states
 */
export type RLPxConnectionState = 'Auth' | 'Ack' | 'Header' | 'Body' | 'Closed'

/**
 * Options for socket configuration
 */
export interface RLPxSocketOptions {
  /**
   * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
   */
  noDelay?: boolean

  /**
   * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
   */
  keepAlive?: boolean

  /**
   * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
   */
  keepAliveInitialDelay?: number

  /**
   * @see https://nodejs.org/api/net.html#new-netsocketoptions
   */
  allowHalfOpen?: boolean
}

/**
 * Options for creating an RLPx transport
 */
export interface RLPxTransportOptions extends RLPxSocketOptions {
  /**
   * Node's private key for ECIES encryption
   */
  privateKey: Uint8Array

  /**
   * Client identifier sent in Hello message
   * Default: "ethereumjs-devp2p/{platform}-{arch}/nodejs"
   */
  clientId?: Uint8Array

  /**
   * Supported protocol capabilities (e.g., ETH/68)
   */
  capabilities: any[]

  /**
   * Chain configuration for protocol compatibility
   */
  common: HardforkManager

  /**
   * Connection timeout in milliseconds
   * Default: 10000 (10 seconds)
   */
  timeout?: number

  /**
   * Maximum number of peers
   * Default: 25
   */
  maxPeers?: number

  /**
   * Filter for remote client IDs to reject
   */
  remoteClientIdFilter?: string[]

  /**
   * Inactivity timeout for inbound sockets
   */
  inboundSocketInactivityTimeout?: number

  /**
   * Inactivity timeout for outbound sockets
   */
  outboundSocketInactivityTimeout?: number

  /**
   * Server backlog for pending connections
   */
  backlog?: number

  /**
   * Maximum connections before server stops accepting
   */
  maxConnections?: number

  /**
   * Close server when max connections reached
   */
  closeServerOnMaxConnections?: CloseServerOnMaxConnectionsOpts
}

/**
 * Options for closing server on max connections
 */
export interface CloseServerOnMaxConnectionsOpts {
  /**
   * Server listens once connection count is less than `listenBelow`
   */
  listenBelow: number

  /**
   * Close server once connection count is greater than or equal to `closeAbove`
   */
  closeAbove: number

  /**
   * Invoked when there was an error listening on a socket
   */
  onListenError?(err: Error): void
}

/**
 * Events emitted during RLPx dial
 */
export type RLPxDialEvents =
  | OutboundConnectionUpgradeEvents
  | ProgressEvent<'rlpx:open-connection'>
  | ProgressEvent<'rlpx:ecies-auth'>
  | ProgressEvent<'rlpx:hello-exchange'>
  | ProgressEvent<'rlpx:connected'>

/**
 * Options for dialing an RLPx peer
 * Note: remoteId is required for ECIES auth initiation
 * Note: RLPx doesn't use libp2p's upgrader since ECIES handles authentication
 */
export interface RLPxDialOptions
  extends Omit<DialTransportOptions<RLPxDialEvents>, 'upgrader'>,
    RLPxSocketOptions {
  /**
   * Remote peer's node ID (public key without 0x04 prefix)
   * Required for initiating ECIES auth
   */
  remoteId?: Uint8Array

  /**
   * Use EIP-8 format for auth/ack messages
   * Default: true
   */
  useEIP8?: boolean

  /**
   * Our listen port to advertise in Hello message
   * Default: 0 (not listening)
   */
  listenPort?: number
}

/**
 * Options for creating an RLPx listener
 * Note: RLPx doesn't use libp2p's upgrader since ECIES handles authentication
 */
export interface RLPxCreateListenerOptions extends RLPxSocketOptions {
  /**
   * Node's private key for ECIES encryption
   */
  privateKey: Uint8Array

  /**
   * Node's public key ID (derived from privateKey)
   */
  nodeId: Uint8Array

  /**
   * Client identifier sent in Hello message
   */
  clientId: Uint8Array

  /**
   * Supported protocol capabilities
   */
  capabilities: any[]

  /**
   * Chain configuration
   */
  common: HardforkManager

  /**
   * Connection timeout in milliseconds
   */
  timeout: number

  /**
   * Filter for remote client IDs to reject
   */
  remoteClientIdFilter?: string[]

  /**
   * Inactivity timeout for sockets
   */
  inactivityTimeout?: number

  /**
   * Maximum connections
   */
  maxConnections?: number

  /**
   * Server backlog
   */
  backlog?: number

  /**
   * Close server on max connections options
   */
  closeServerOnMaxConnections?: CloseServerOnMaxConnectionsOpts

  /**
   * Logger instance
   */
  logger: ComponentLogger

  /**
   * Metrics instance
   */
  metrics?: Metrics

  /**
   * Listen port (for Hello message)
   */
  listenPort: number
}

/**
 * Components required by RLPx transport
 * @deprecated Use Libp2pComponents from @libp2p/interface-internal instead
 */
export interface RLPxComponents {
  metrics?: Metrics
  logger: ComponentLogger
}

/**
 * Metrics for RLPx transport
 */
export interface RLPxMetrics {
  events: CounterGroup<
    | 'error'
    | 'timeout'
    | 'connect'
    | 'abort'
    | 'auth_sent'
    | 'auth_received'
    | 'hello_sent'
    | 'hello_received'
  >
  errors: CounterGroup<
    | 'outbound_to_connection'
    | 'outbound_upgrade'
    | 'ecies_auth'
    | 'hello_exchange'
  >
}

/**
 * Options for creating an RLPx connection
 */
export interface RLPxConnectionOptions {
  /**
   * The underlying TCP socket
   */
  socket: Socket

  /**
   * Node's private key for ECIES
   */
  privateKey: Uint8Array

  /**
   * Node's public key ID
   */
  nodeId: Uint8Array

  /**
   * Remote peer's node ID (null for inbound connections until auth)
   */
  remoteId: Uint8Array | null

  /**
   * Client identifier for Hello message
   */
  clientId: Uint8Array

  /**
   * Supported capabilities
   */
  capabilities: any[]

  /**
   * Chain configuration
   */
  common: HardforkManager

  /**
   * Connection timeout
   */
  timeout: number

  /**
   * Listen port for Hello message
   */
  listenPort: number

  /**
   * Filter for remote client IDs
   */
  remoteClientIdFilter?: string[]

  /**
   * Use EIP-8 format
   */
  useEIP8?: boolean

  /**
   * Direction of connection
   */
  direction: 'inbound' | 'outbound'

  /**
   * Logger instance
   */
  logger: ComponentLogger

  /**
   * Inactivity timeout
   */
  inactivityTimeout?: number
}

/**
 * RLPx connection events
 */
export interface RLPxConnectionEvents {
  'protocols:ready': [protocols: any[]]
  /**
   * Emitted when Hello exchange is complete
   */
  connect: []

  /**
   * Emitted when connection is closed
   */
  close: [reason: number | undefined, initiatedByUs: boolean | null]

  /**
   * Emitted on error
   */
  error: [error: Error]

  /**
   * Emitted when a subprotocol message is received
   */
  message: [code: number, payload: Uint8Array]
}

/**
 * RLPx listener events
 */
export interface RLPxListenerEvents {
  /**
   * Emitted when listener starts
   */
  listening: []

  /**
   * Emitted when listener closes
   */
  close: []

  /**
   * Emitted on error
   */
  error: [detail: Error]

  /**
   * Emitted when a new connection is established (after Hello exchange)
   */
  connection: [connection: import('./connection').RLPxConnection]
}

/**
 * Base protocol message prefixes
 */
export const RLPX_PREFIXES = {
  HELLO: 0x00,
  DISCONNECT: 0x01,
  PING: 0x02,
  PONG: 0x03,
} as const

export type RLPxPrefix = (typeof RLPX_PREFIXES)[keyof typeof RLPX_PREFIXES]

/**
 * Base protocol version and length
 */
export const BASE_PROTOCOL_VERSION = 5
export const BASE_PROTOCOL_LENGTH = 16

/**
 * Default ping interval in milliseconds
 */
export const PING_INTERVAL = 15000
