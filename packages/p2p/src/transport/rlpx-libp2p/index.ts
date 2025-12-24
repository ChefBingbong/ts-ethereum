/**
 * RLPx Transport - libp2p-compatible transport for Ethereum's RLPx protocol
 *
 * @packageDocumentation
 *
 * This transport implements the Ethereum RLPx protocol with ECIES encryption
 * and Hello handshake, compatible with js-libp2p's createLibp2p entrypoint.
 *
 * @example
 *
 * ```typescript
 * import { createLibp2p } from 'libp2p'
 * import { rlpx } from '@ts-ethereum/p2p/transport/rlpx-libp2p'
 * import { ETH } from '@ethereumjs/devp2p'
 *
 * // Create libp2p node with RLPX transport
 * const node = await createLibp2p({
 *   transports: [
 *     rlpx({
 *       privateKey: myPrivateKey,
 *       capabilities: [ETH.eth68],
 *       common: myCommon,
 *       timeout: 10000,
 *     })
 *   ],
 *   // No connectionEncrypters - RLPX handles ECIES
 *   // No streamMuxers - RLPX doesn't use muxing
 * })
 * ```
 */

// Transport
export { rlpxLibp2p, RLPxTransport } from './transport'

// Listener
export { RLPxListener } from './listener'
export type { RLPxListenerEvents } from './listener'

// Connection and Adapter
export { RLPxConnection } from './connection'
export { RLPxConnectionAdapter } from './connection-adapter'
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


