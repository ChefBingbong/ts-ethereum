/**
 * RLPx Transport - libp2p-style transport for Ethereum's RLPx protocol
 *
 * @packageDocumentation
 *
 * This transport implements the Ethereum RLPx protocol with ECIES encryption
 * and Hello handshake, following the libp2p Transport interface pattern.
 *
 * @example
 *
 * ```typescript
 * import { rlpx, RLPxTransport } from './transport/rlpx'
 * import { ETH } from '@ethereumjs/devp2p'
 *
 * // Create transport with options
 * const transport = rlpx({
 *   privateKey: myPrivateKey,
 *   capabilities: [ETH.eth68],
 *   common: myCommon,
 *   timeout: 10000,
 * })({ logger, metrics })
 *
 * // Create listener for inbound connections
 * const listener = transport.createListener({})
 * listener.addEventListener('rlpx:connection', (evt) => {
 *   const connection = evt.detail
 *   console.log('New peer:', connection.getHelloMessage()?.clientId)
 * })
 * await listener.listen(multiaddr('/ip4/0.0.0.0/tcp/30303'))
 *
 * // Dial a peer (requires remote node ID)
 * const connection = await transport.dial(
 *   multiaddr('/ip4/1.2.3.4/tcp/30303'),
 *   {
 *     remoteId: remoteNodeId,
 *     signal: AbortSignal.timeout(10000),
 *   }
 * )
 * ```
 */

// Transport
export { rlpx, RLPxTransport } from './transport'

// Listener
export { RLPxListener } from './listener'
export type { RLPxListenerEvents } from './listener'

// Connection
export { RLPxConnection } from './connection'

// Types
export type {
	CloseServerOnMaxConnectionsOpts, HelloMessage,
	ProtocolDescriptor, RLPxComponents, RLPxConnectionEvents,
	// Connection options and types
	RLPxConnectionOptions, RLPxConnectionState,
	// Listener options
	RLPxCreateListenerOptions, RLPxDialEvents,
	// Dial options
	RLPxDialOptions, RLPxMetrics, RLPxPrefix, RLPxSocketOptions,
	// Transport options
	RLPxTransportOptions
} from './types'


