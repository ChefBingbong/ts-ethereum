import type { RegistryMetricCreator } from '../utils/registryMetricCreator.js'

export type NetworkMetrics = ReturnType<typeof createNetworkMetrics>

/**
 * Create network metrics
 */
export function createNetworkMetrics(register: RegistryMetricCreator) {
  return {
    peerCount: register.gauge({
      name: 'eth_network_peer_count',
      help: 'Current number of connected peers',
    }),
    peerConnections: register.counter<{ direction: string }>({
      name: 'eth_network_peer_connections_total',
      help: 'Total number of peer connections',
      labelNames: ['direction'],
    }),
    peerDisconnections: register.counter({
      name: 'eth_network_peer_disconnections_total',
      help: 'Total number of peer disconnections',
    }),
    peerBans: register.counter({
      name: 'eth_network_peer_bans_total',
      help: 'Total number of peer bans',
    }),
    protocolMessages: register.counter<{
      protocol: string
      message_type: string
    }>({
      name: 'eth_network_protocol_messages_total',
      help: 'Total number of protocol messages received',
      labelNames: ['protocol', 'message_type'],
    }),
    protocolErrors: register.counter<{ protocol: string; error_type: string }>({
      name: 'eth_network_protocol_errors_total',
      help: 'Total number of protocol errors',
      labelNames: ['protocol', 'error_type'],
    }),
    bytesReceived: register.counter({
      name: 'eth_network_bytes_received_total',
      help: 'Total bytes received from network',
    }),
    bytesSent: register.counter({
      name: 'eth_network_bytes_sent_total',
      help: 'Total bytes sent to network',
    }),
    connectionAttempts: register.counter<{ status: string }>({
      name: 'eth_network_connection_attempts_total',
      help: 'Total number of connection attempts',
      labelNames: ['status'],
    }),
    connectionFailures: register.counter({
      name: 'eth_network_connection_failures_total',
      help: 'Total number of connection failures',
    }),
  }
}
