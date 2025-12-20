/**
 * Simplified libp2p-style P2P networking stack
 *
 * This module provides a simplified P2P node implementation inspired by libp2p,
 * tailored for Ethereum-style RLPx connections.
 *
 * @example
 * ```typescript
 * import { createP2PNode, rlpx } from './p2p/libp2p'
 *
 * const node = await createP2PNode({
 *   privateKey: myPrivateKey,
 *   addresses: {
 *     listen: ['/ip4/0.0.0.0/tcp/30303']
 *   },
 *   transports: [
 *     rlpx({
 *       privateKey: myPrivateKey,
 *       capabilities: [ETH.eth68],
 *       common: myCommon,
 *     })
 *   ]
 * })
 *
 * await node.start()
 *
 * // Listen for peer connections
 * node.addEventListener('peer:connect', (evt) => {
 *   console.log('Peer connected:', evt.detail)
 * })
 *
 * // Register a topology for protocol notifications
 * node.register('/eth/68', {
 *   onConnect: (peerId, connection) => {
 *     console.log('ETH peer connected:', peerId)
 *   },
 *   onDisconnect: (peerId) => {
 *     console.log('ETH peer disconnected:', peerId)
 *   }
 * })
 *
 * // Dial a peer
 * const connection = await node.dial(peerMultiaddr, { remoteId: peerNodeId })
 * ```
 */

// Main node class and factory
export { P2PNode, createP2PNode, createAndStartP2PNode } from "./node.ts";

// Address manager
export {
	AddressManager,
	createAddressManager,
	type AddressManagerInit,
	type AddressManagerComponents,
} from "./address-manager.ts";

// Transport manager
export {
	TransportManager,
	createTransportManager,
	TransportUnavailableError,
	UnsupportedListenAddressError,
	type TransportManagerInit,
	type TransportManagerComponents,
} from "./transport-manager.ts";

// Connection manager
export {
	ConnectionManager,
	ConnectionWrapper,
	createConnectionManager,
	type ConnectionManagerInit,
	type ConnectionManagerComponents,
} from "./connection-manager.ts";

// Registrar
export {
	Registrar,
	createRegistrar,
	DuplicateProtocolHandlerError,
	UnhandledProtocolError,
	type RegistrarComponents,
} from "./registrar.ts";

// Types
export type {
	// Core types
	PeerId,
	P2PNodeStatus,
	ConnectionDirection,
	ConnectionStatus,
	AbortOptions,

	// Stream handler types
	StreamHandler,
	StreamHandlerOptions,
	StreamHandlerRecord,

	// Topology types
	TopologyFilter,
	Topology,

	// Peer types
	PeerInfo,
	Peer,
	PeerUpdate,

	// Connection types
	ConnectionTimeline,
	Connection,

	// Event types
	P2PNodeEvents,
	IdentifyResult,

	// Component types
	Logger,
	ComponentLogger,
	TransportManagerDialOptions,
	AddressManager as AddressManagerInterface,
	TransportManager as TransportManagerInterface,
	ConnectionManager as ConnectionManagerInterface,
	Registrar as RegistrarInterface,

	// Configuration types
	AddressConfig,
	TransportFactory,
	PeerDiscovery,
	PeerDiscoveryEvents,
	P2PNodeInit,
	P2PNodeComponents,
	P2PNode as P2PNodeInterface,
} from "./types.ts";

// Utility functions
export {
	peerIdToString,
	peerIdEquals,
	peerDiscoverySymbol,
	DEFAULT_MAX_INBOUND_STREAMS,
	DEFAULT_MAX_OUTBOUND_STREAMS,
	DEFAULT_MAX_CONNECTIONS,
	DEFAULT_DIAL_TIMEOUT,
} from "./types.ts";

